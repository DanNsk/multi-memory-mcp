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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { CategoryManager } from './managers/CategoryManager.js';
import { KnowledgeGraphManager } from './managers/KnowledgeGraphManager.js';
import type { Entity, Relation, Observation } from './types/graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEMORY_BASE_DIR = process.env.MEMORY_BASE_DIR || path.join(__dirname, '..', '.memory');
const DEFAULT_CATEGORY = process.env.DEFAULT_CATEGORY || 'default';

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
        description: "Create multiple new entities in the knowledge graph",
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
                  entityType: { type: "string", description: "The type of the entity" },
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
                required: ["name", "entityType", "observations"],
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
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
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
                  to: { type: "string", description: "The name of the entity where the relation ends" },
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
        description: "Add new observations to existing entities in the knowledge graph",
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
            entityNames: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to delete"
            },
          },
          required: ["entityNames"],
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
                  to: { type: "string", description: "The name of the entity where the relation ends" },
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
        description: "Read the entire knowledge graph from a category",
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
        description: "Search for nodes in the knowledge graph based on a query",
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
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Memory category (e.g., 'work', 'personal', 'project-alpha'). Defaults to 'default'",
            },
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
          additionalProperties: false,
        },
      },
      {
        name: "list_categories",
        description: "List all available memory categories",
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
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.createEntities(
                args?.entities as Entity[],
                args?.category as string | undefined
              ),
              null,
              2
            )
          }]
        };

      case "create_relations":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.createRelations(
                args?.relations as Relation[],
                args?.category as string | undefined
              ),
              null,
              2
            )
          }]
        };

      case "add_observations":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.addObservations(
                args?.observations as { entityName: string; contents: Observation[] }[],
                args?.category as string | undefined
              ),
              null,
              2
            )
          }]
        };

      case "delete_entities":
        await knowledgeGraphManager.deleteEntities(
          args?.entityNames as string[],
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Entities deleted successfully" }] };

      case "delete_observations":
        await knowledgeGraphManager.deleteObservations(
          args?.deletions as { entityName: string; observations: Observation[] }[],
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Observations deleted successfully" }] };

      case "delete_relations":
        await knowledgeGraphManager.deleteRelations(
          args?.relations as Relation[],
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Relations deleted successfully" }] };

      case "read_graph":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.readGraph(args?.category as string | undefined),
              null,
              2
            )
          }]
        };

      case "search_nodes":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.searchNodes(
                args?.query as string,
                args?.category as string | undefined
              ),
              null,
              2
            )
          }]
        };

      case "open_nodes":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.openNodes(
                args?.names as string[],
                args?.category as string | undefined
              ),
              null,
              2
            )
          }]
        };

      case "list_categories":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(
              await knowledgeGraphManager.listCategories(),
              null,
              2
            )
          }]
        };

      case "delete_category":
        if (!args?.category) {
          throw new Error("Category parameter is required");
        }
        await knowledgeGraphManager.deleteCategory(args.category as string);
        return { content: [{ type: "text", text: `Category '${args.category}' deleted successfully` }] };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ error: errorMessage }, null, 2)
      }],
      isError: true,
    };
  }
});

async function main() {
  console.error(`Multi-Memory MCP Server starting...`);
  console.error(`Memory base directory: ${MEMORY_BASE_DIR}`);
  console.error(`Default category: ${DEFAULT_CATEGORY}`);

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
