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
import { serialize, type SerializationFormat } from './serializer.js';
import type { Entity, Observation, RelationInput, EntityReference, RelationIdentifier, ObservationIdentifier } from './types/graph.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEMORY_BASE_DIR = process.env.MEMORY_BASE_DIR || path.join(process.cwd(), '.aim');
const DEFAULT_CATEGORY = process.env.DEFAULT_CATEGORY || 'default';
const SERIALIZATION_FORMAT = (process.env.SERIALIZATION_FORMAT || 'json') as SerializationFormat;

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
        description: "Create multiple new entities in the knowledge graph. Returns entities with their assigned IDs. Output format controlled by SERIALIZATION_FORMAT env (json/toon).",
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
                        source: { type: "string", description: "Source of the observation (optional)" }
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
        description: "Add new observations to existing entities. Entity can be specified by entityId OR by entityName/entityType. Returns observation IDs.",
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
                        text: { type: "string", description: "The observation text content" },
                        timestamp: { type: "string", description: "ISO 8601 timestamp (optional)" },
                        source: { type: "string", description: "Source of the observation (optional)" }
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
        description: "Delete specific observations. Specify by observation id OR by entity identifier + text content.",
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
                  id: { type: "string", description: "Observation ID (alternative to entity+text)" },
                  entityId: { type: "string", description: "Entity ID (alternative to entityName/entityType)" },
                  entityName: { type: "string", description: "Entity name (use with entityType)" },
                  entityType: { type: "string", description: "Entity type (defaults to empty string)" },
                  text: { type: "string", description: "Observation text content to delete" }
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
        description: "Delete relations. Specify by relation id OR by full composite key (from/fromType/to/toType/relationType).",
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
                  id: { type: "string", description: "Relation ID (alternative to composite key)" },
                  from: { type: "string", description: "Source entity name" },
                  fromType: { type: "string", description: "Source entity type (defaults to empty string)" },
                  to: { type: "string", description: "Target entity name" },
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
        description: "Search for nodes by query string. Returns matching entities and relations with their IDs.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description: "Memory category. Defaults to 'default'",
            },
            query: { type: "string", description: "Search query to match against entity names, types, and observations" },
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
        const entitiesWithDefaults = (args?.entities as any[])?.map(e => ({
          ...e,
          entityType: e.entityType ?? ''
        })) as Entity[];
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.createEntities(
                entitiesWithDefaults,
                args?.category as string | undefined
              ),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "create_relations":
        // Convert input to RelationInput format with defaults
        const relationsInput = (args?.relations as any[])?.map(r => ({
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
        })) as RelationInput[];
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.createRelations(
                relationsInput,
                args?.category as string | undefined
              ),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "add_observations":
        const observationsInput = (args?.observations as any[])?.map(o => ({
          entityId: o.entityId,
          entityName: o.entityName,
          entityType: o.entityType ?? '',
          contents: o.contents as Observation[]
        }));
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.addObservations(
                observationsInput,
                args?.category as string | undefined
              ),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "delete_entities":
        const deleteEntitiesInput = (args?.entities as any[])?.map(e => ({
          id: e.id,
          name: e.name,
          entityType: e.entityType ?? ''
        })) as EntityReference[];
        await knowledgeGraphManager.deleteEntities(
          deleteEntitiesInput,
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Entities deleted successfully" }] };

      case "delete_observations":
        const deletionsInput = (args?.deletions as any[])?.map(d => ({
          id: d.id,
          entityId: d.entityId,
          entityName: d.entityName,
          entityType: d.entityType ?? '',
          text: d.text
        })) as ObservationIdentifier[];
        await knowledgeGraphManager.deleteObservations(
          deletionsInput,
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Observations deleted successfully" }] };

      case "delete_relations":
        const deleteRelationsInput = (args?.relations as any[])?.map(r => ({
          id: r.id,
          from: r.from,
          fromType: r.fromType ?? '',
          to: r.to,
          toType: r.toType ?? '',
          relationType: r.relationType
        })) as RelationIdentifier[];
        await knowledgeGraphManager.deleteRelations(
          deleteRelationsInput,
          args?.category as string | undefined
        );
        return { content: [{ type: "text", text: "Relations deleted successfully" }] };

      case "read_graph":
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.readGraph(args?.category as string | undefined),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "search_nodes":
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.searchNodes(
                args?.query as string,
                args?.category as string | undefined
              ),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "open_nodes":
        const openNodesInput = (args?.entities as any[])?.map(e => ({
          id: e.id,
          name: e.name,
          entityType: e.entityType ?? ''
        })) as EntityReference[];
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.openNodes(
                openNodesInput,
                args?.category as string | undefined
              ),
              SERIALIZATION_FORMAT
            )
          }]
        };

      case "list_categories":
        return {
          content: [{
            type: "text",
            text: serialize(
              await knowledgeGraphManager.listCategories(),
              SERIALIZATION_FORMAT
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
