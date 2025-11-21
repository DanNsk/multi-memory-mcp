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
                description: "Create multiple new entities in the knowledge graph. Returns entities with their assigned IDs. Constraints: entities unique by (name, entityType); observations unique by (entity, observationType, source).",
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
                                                observationType: { type: "string", description: "Type/category of observation (optional, defaults to empty string)" },
                                                text: { type: "string", description: "The observation text content" },
                                                timestamp: { type: "string", description: "ISO 8601 timestamp (optional, defaults to current time)" },
                                                source: { type: "string", description: "Source of the observation (optional, defaults to empty string)" }
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
                description: "Create multiple new relations between entities. Each endpoint (from/to) can be specified by id OR by name/type. Returns relations with their assigned IDs.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    from: {
                                        type: "object",
                                        description: "Source entity - specify either id OR name/type",
                                        properties: {
                                            id: { type: "string", description: "Entity ID (alternative to name/type)" },
                                            name: { type: "string", description: "Entity name (use with type)" },
                                            type: { type: "string", description: "Entity type (defaults to empty string)" }
                                        },
                                        additionalProperties: false
                                    },
                                    to: {
                                        type: "object",
                                        description: "Target entity - specify either id OR name/type",
                                        properties: {
                                            id: { type: "string", description: "Entity ID (alternative to name/type)" },
                                            name: { type: "string", description: "Entity name (use with type)" },
                                            type: { type: "string", description: "Entity type (defaults to empty string)" }
                                        },
                                        additionalProperties: false
                                    },
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
                description: "Add new observations to existing entities. Entity can be specified by entityId OR by entityName/entityType. Returns observation IDs. Constraint: observations unique by (entity, observationType, source).",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        observations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    entityId: { type: "string", description: "Entity ID (alternative to entityName/entityType)" },
                                    entityName: { type: "string", description: "Entity name (use with entityType)" },
                                    entityType: { type: "string", description: "Entity type (defaults to empty string)" },
                                    contents: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                observationType: { type: "string", description: "Type/category of observation (optional, defaults to empty string)" },
                                                text: { type: "string", description: "The observation text content" },
                                                timestamp: { type: "string", description: "ISO 8601 timestamp (optional)" },
                                                source: { type: "string", description: "Source of the observation (optional, defaults to empty string)" }
                                            },
                                            required: ["text"],
                                            additionalProperties: false
                                        },
                                        description: "An array of observations to add"
                                    },
                                },
                                required: ["contents"],
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
                description: "Delete entities and their relations. Specify each entity by id OR by name/entityType.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "Entity ID (alternative to name/entityType)" },
                                    name: { type: "string", description: "Entity name (use with entityType)" },
                                    entityType: { type: "string", description: "Entity type (defaults to empty string)" },
                                },
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
                description: "Delete specific observations. Specify by observation id OR by entity identifier + observationType + source.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        deletions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "Observation ID (alternative to entity+observationType+source)" },
                                    entityId: { type: "string", description: "Entity ID (alternative to entityName/entityType)" },
                                    entityName: { type: "string", description: "Entity name (use with entityType)" },
                                    entityType: { type: "string", description: "Entity type (defaults to empty string)" },
                                    observationType: { type: "string", description: "Observation type (defaults to empty string)" },
                                    source: { type: "string", description: "Observation source (defaults to empty string)" }
                                },
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
                description: "Delete relations. Specify by relation id OR by entity IDs (fromId/toId/relationType) OR by entity names (from/fromType/to/toType/relationType).",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        relations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "Relation ID (alternative to other methods)" },
                                    fromId: { type: "string", description: "Source entity ID (alternative to from/fromType)" },
                                    toId: { type: "string", description: "Target entity ID (alternative to to/toType)" },
                                    from: { type: "string", description: "Source entity name (use with fromType)" },
                                    fromType: { type: "string", description: "Source entity type (defaults to empty string)" },
                                    to: { type: "string", description: "Target entity name (use with toType)" },
                                    toType: { type: "string", description: "Target entity type (defaults to empty string)" },
                                    relationType: { type: "string", description: "Relation type" },
                                },
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
                description: "Read the entire knowledge graph. Returns all entities (with IDs) and relations (with IDs).",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                    },
                    additionalProperties: false,
                },
            },
            {
                name: "search_nodes",
                description: "Full-text search with BM25 ranking. Returns matching entities sorted by relevance. Supports FTS5 query syntax: simple terms (auth), phrases (\"user auth\"), AND/OR/NOT operators (user AND auth), prefix matching (auth*), proximity search (NEAR(user auth, 5)). Simple queries auto-convert to prefix-matching AND search.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        query: { type: "string", description: "FTS5 search query. Examples: 'authentication', 'user AND auth', '\"user authentication\"', 'auth*', 'user OR admin'" },
                        limit: { type: "number", description: "Maximum number of results to return. Defaults to 50" },
                    },
                    required: ["query"],
                    additionalProperties: false,
                },
            },
            {
                name: "open_nodes",
                description: "Open specific entities. Specify each by id OR by name/entityType. Returns entities with their IDs.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category. Defaults to 'default'",
                        },
                        entities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string", description: "Entity ID (alternative to name/entityType)" },
                                    name: { type: "string", description: "Entity name (use with entityType)" },
                                    entityType: { type: "string", description: "Entity type (defaults to empty string)" },
                                },
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
                description: "List all available memory categories.",
                inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                },
            },
            {
                name: "delete_category",
                description: "Delete an entire memory category and all its contents.",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: {
                            type: "string",
                            description: "Memory category to delete",
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
                // Convert input to RelationInput format with defaults
                const relationsInput = args?.relations?.map(r => ({
                    from: {
                        id: r.from?.id,
                        name: r.from?.name,
                        type: r.from?.type ?? ''
                    },
                    to: {
                        id: r.to?.id,
                        name: r.to?.name,
                        type: r.to?.type ?? ''
                    },
                    relationType: r.relationType
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.createRelations(relationsInput, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "add_observations":
                const observationsInput = args?.observations?.map(o => ({
                    entityId: o.entityId,
                    entityName: o.entityName,
                    entityType: o.entityType ?? '',
                    contents: o.contents
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.addObservations(observationsInput, args?.category), SERIALIZATION_FORMAT)
                        }]
                };
            case "delete_entities":
                const deleteEntitiesInput = args?.entities?.map(e => ({
                    id: e.id,
                    name: e.name,
                    entityType: e.entityType ?? ''
                }));
                await knowledgeGraphManager.deleteEntities(deleteEntitiesInput, args?.category);
                return { content: [{ type: "text", text: "Entities deleted successfully" }] };
            case "delete_observations":
                const deletionsInput = args?.deletions?.map(d => ({
                    id: d.id,
                    entityId: d.entityId,
                    entityName: d.entityName,
                    entityType: d.entityType ?? '',
                    observationType: d.observationType ?? '',
                    source: d.source ?? ''
                }));
                await knowledgeGraphManager.deleteObservations(deletionsInput, args?.category);
                return { content: [{ type: "text", text: "Observations deleted successfully" }] };
            case "delete_relations":
                const deleteRelationsInput = args?.relations?.map(r => ({
                    id: r.id,
                    fromId: r.fromId,
                    toId: r.toId,
                    fromName: r.from,
                    fromType: r.fromType ?? '',
                    toName: r.to,
                    toType: r.toType ?? '',
                    relationType: r.relationType
                }));
                await knowledgeGraphManager.deleteRelations(deleteRelationsInput, args?.category);
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
                            text: serialize(await knowledgeGraphManager.searchNodes(args?.query, args?.category, args?.limit), SERIALIZATION_FORMAT)
                        }]
                };
            case "open_nodes":
                const openNodesInput = args?.entities?.map(e => ({
                    id: e.id,
                    name: e.name,
                    entityType: e.entityType ?? ''
                }));
                return {
                    content: [{
                            type: "text",
                            text: serialize(await knowledgeGraphManager.openNodes(openNodesInput, args?.category), SERIALIZATION_FORMAT)
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