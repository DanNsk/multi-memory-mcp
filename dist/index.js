#!/usr/bin/env node
/*MIT License

Copyright (c) 2025 Anthropic, PBC
Modified work Copyright (c) 2025 DanNsk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { CategoryManager } from './managers/CategoryManager.js';
import { KnowledgeGraphManager } from './managers/KnowledgeGraphManager.js';
import { serialize } from './serializer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_BASE_DIR = process.env.MEMORY_BASE_DIR || path.join(process.cwd(), '.aim');
const DEFAULT_CATEGORY = process.env.DEFAULT_CATEGORY || 'default';
const SERIALIZATION_FORMAT = (process.env.SERIALIZATION_FORMAT || 'json');
const categoryManager = new CategoryManager(MEMORY_BASE_DIR);
const knowledgeGraphManager = new KnowledgeGraphManager(categoryManager, DEFAULT_CATEGORY);
const server = new Server({
    name: "multi-memory-mcp",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "create_entities",
                description: "Create multiple new entities in the knowledge graph. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "The name of the entity" },
                                    entityType: { type: "string", description: "The type of the entity (defaults to empty string)" },
                                    observations: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                text: { type: "string", description: "The observation text content" },
                                                timestamp: { type: "string", description: "ISO 8601 timestamp (optional, defaults to current time)" },
                                                source: { type: "string", description: "Source of the observation (optional, e.g., 'code-analysis', 'user-input')" }
                                            },
                                            required: ["text"],
                                            additionalProperties: false
                                        },
                                        description: "An array of observations associated with the entity"
                                    },
                                },
                                required: ["name", "observations"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["entities"],
                    additionalProperties: false,
                },
            },
            {
                name: "create_relations",
                description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    from: { type: "string", description: "The name of the entity where the relation starts" },
                                    fromType: { type: "string", description: "The type of the from entity (defaults to empty string)" },
                                    to: { type: "string", description: "The name of the entity where the relation ends" },
                                    toType: { type: "string", description: "The type of the to entity (defaults to empty string)" },
                                    relationType: { type: "string", description: "The type of the relation" },
                                },
                                required: ["from", "to", "relationType"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["relations"],
                    additionalProperties: false,
                },
            },
            {
                name: "add_observations",
                description: "Add new observations to existing entities in the knowledge graph. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        observations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    entityName: { type: "string", description: "The name of the entity to add the observations to" },
                                    entityType: { type: "string", description: "The type of the entity (defaults to empty string)" },
                                    contents: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                text: { type: "string", description: "The observation text content" },
                                                timestamp: { type: "string", description: "ISO 8601 timestamp (optional, defaults to current time)" },
                                                source: { type: "string", description: "Source of the observation (optional, e.g., 'code-analysis', 'user-input')" }
                                            },
                                            required: ["text"],
                                            additionalProperties: false
                                        },
                                        description: "An array of observations to add"
                                    },
                                },
                                required: ["entityName", "contents"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["observations"],
                    additionalProperties: false,
                },
            },
            {
                name: "delete_entities",
                description: "Delete multiple entities and their associated relations from the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "The name of the entity to delete" },
                                    entityType: { type: "string", description: "The type of the entity (defaults to empty string)" },
                                },
                                required: ["name"],
                                additionalProperties: false,
                            },
                            description: "An array of entities to delete"
                        },
                    },
                    required: ["entities"],
                    additionalProperties: false,
                },
            },
            {
                name: "delete_observations",
                description: "Delete specific observations from entities in the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        deletions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    entityName: { type: "string", description: "The name of the entity containing the observations" },
                                    entityType: { type: "string", description: "The type of the entity (defaults to empty string)" },
                                    observations: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                text: { type: "string", description: "The observation text content to delete" },
                                                timestamp: { type: "string", description: "ISO 8601 timestamp (optional)" },
                                                source: { type: "string", description: "Source of the observation (optional)" }
                                            },
                                            required: ["text"],
                                            additionalProperties: false
                                        },
                                        description: "An array of observations to delete (matched by text content)"
                                    },
                                },
                                required: ["entityName", "observations"],
                                additionalProperties: false,
                            },
                        },
                    },
                    required: ["deletions"],
                    additionalProperties: false,
                },
            },
            {
                name: "delete_relations",
                description: "Delete multiple relations from the knowledge graph",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    from: { type: "string", description: "The name of the entity where the relation starts" },
                                    fromType: { type: "string", description: "The type of the from entity (defaults to empty string)" },
                                    to: { type: "string", description: "The name of the entity where the relation ends" },
                                    toType: { type: "string", description: "The type of the to entity (defaults to empty string)" },
                                    relationType: { type: "string", description: "The type of the relation" },
                                },
                                required: ["from", "to", "relationType"],
                                additionalProperties: false,
                            },
                            description: "An array of relations to delete"
                        },
                    },
                    required: ["relations"],
                    additionalProperties: false,
                },
            },
            {
                name: "read_graph",
                description: "Read the entire knowledge graph from a category. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                    },
                    additionalProperties: false,
                },
            },
            {
                name: "search_nodes",
                description: "Search for nodes in the knowledge graph based on a query. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
                    },
                    required: ["query"],
                    additionalProperties: false,
                },
            },
            {
                name: "open_nodes",
                description: "Open specific nodes in the knowledge graph by their names and types. Output format controlled by SERIALIZATION_FORMAT env (json/toon). TOON escaping: \\\\ (backslash), \\\" (quote), \\n (newline), \\r (carriage return), \\t (tab)",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
                        },
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string", description: "The name of the entity" },
                                    entityType: { type: "string", description: "The type of the entity (defaults to empty string)" },
                                },
                                required: ["name"],
                                additionalProperties: false,
                            },
                            description: "An array of entities to retrieve",
                        },
                    },
                    required: ["entities"],
                    additionalProperties: false,
                },
            },
            {
                name: "list_categories",
                description: "List all available memory categories. Output format controlled by SERIALIZATION_FORMAT env (json/toon)",
                inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                },
            },
            {
                name: "delete_category",
                description: "Delete an entire memory category and all its contents",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category to delete (e.g., 'work', 'personal', 'project-alpha')",
                        },
                    },
                    required: ["category"],
                    additionalProperties: false,
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "create_entities":
                const entitiesWithDefaults = args?.entities?.map(e => ({
                    ...e,
                    entityType: e.entityType ?? ''
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.createEntities(entitiesWithDefaults, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "create_relations":
                const relationsWithDefaults = args?.relations?.map(r => ({
                    ...r,
                    fromType: r.fromType ?? '',
                    toType: r.toType ?? ''
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.createRelations(relationsWithDefaults, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "add_observations":
                const observationsWithDefaults = args?.observations?.map(o => ({
                    ...o,
                    entityType: o.entityType ?? ''
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.addObservations(observationsWithDefaults, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "delete_entities":
                const deleteEntitiesWithDefaults = args?.entities?.map(e => ({
                    ...e,
                    entityType: e.entityType ?? ''
                }));
                await knowledgeGraphManager.deleteEntities(deleteEntitiesWithDefaults, args?.category);
                return { content: [{ type: "text", text: "Entities deleted successfully" }] };
            case "delete_observations":
                const deletionsWithDefaults = args?.deletions?.map(d => ({
                    ...d,
                    entityType: d.entityType ?? ''
                }));
                await knowledgeGraphManager.deleteObservations(deletionsWithDefaults, args?.category);
                return { content: [{ type: "text", text: "Observations deleted successfully" }] };
            case "delete_relations":
                const deleteRelationsWithDefaults = args?.relations?.map(r => ({
                    ...r,
                    fromType: r.fromType ?? '',
                    toType: r.toType ?? ''
                }));
                await knowledgeGraphManager.deleteRelations(deleteRelationsWithDefaults, args?.category);
                return { content: [{ type: "text", text: "Relations deleted successfully" }] };
            case "read_graph":
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.readGraph(args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "search_nodes":
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.searchNodes(args?.query, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "open_nodes":
                const openNodesWithDefaults = args?.entities?.map(e => ({
                    ...e,
                    entityType: e.entityType ?? ''
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.openNodes(openNodesWithDefaults, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "list_categories":
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.listCategories(), SERIALIZATION_FORMAT)
                        }]
                };
            case "delete_category":
                if (!args?.category) {
                    throw new Error("Category parameter is required");
                }
                await knowledgeGraphManager.deleteCategory(args.category);
                return { content: [{ type: "text", text: `Category '${args.category}' deleted successfully` }] };
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            content: [{
                    type: "text",
                    text: serialize({ error: errorMessage }, SERIALIZATION_FORMAT)
                }],
            isError: true,
        };
    }
});
async function main() {
    console.error(`Multi-Memory MCP Server starting...`);
    console.error(`Memory base directory: ${MEMORY_BASE_DIR}`);
    console.error(`Default category: ${DEFAULT_CATEGORY}`);
    console.error(`Serialization format: ${SERIALIZATION_FORMAT}`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Multi-Memory MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
process.on('SIGINT', () => {
    console.error('Shutting down...');
    knowledgeGraphManager.closeAll();
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.error('Shutting down...');
    knowledgeGraphManager.closeAll();
    process.exit(0);
});
//# sourceMappingURL=index.js.map