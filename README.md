# Multi-Memory MCP Server

A multi-category knowledge graph memory server using SQLite for persistent storage. Organize memories into isolated contexts for different purposes (work, personal, projects, etc.).

**Based on** `@modelcontextprotocol/server-memory` **with enhancements:**
- SQLite database storage with proper indexing and transactions
- Multi-category support with isolated memory contexts
- LRU connection cache (prevents memory leaks)
- **ID-based operations** - all objects have unique IDs for precise operations
- **Dual identification** - use ID or name/type composite key
- **Custom properties** - JSON properties on entities, observations, and relations (searchable)
- **Override mode** - update existing records instead of skipping duplicates
- SQL injection protection
- Full test coverage (141 tests)

## Quick Start

### Run Directly with npx (No Installation Required)

The fastest way to use multi-memory-mcp is to run it directly from GitHub using `npx`:

```bash
npx github:DanNsk/multi-memory-mcp
```

This will download, build, and run the server automatically. Perfect for trying it out or using in Claude Desktop config:

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "npx",
      "args": ["github:DanNsk/multi-memory-mcp"],
      "env": {
        "MEMORY_BASE_DIR": "/path/to/.memory",
        "DEFAULT_CATEGORY": "default"
      }
    }
  }
}
```

### Installation (Local Development)

```bash
git clone https://github.com/DanNsk/multi-memory-mcp
cd multi-memory-mcp
npm install
npm run build
```

### Configuration

Add to Claude Desktop config:

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Using npx (recommended):**

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "npx",
      "args": ["github:DanNsk/multi-memory-mcp"],
      "env": {
        "MEMORY_BASE_DIR": "/Users/yourname/.memory",
        "DEFAULT_CATEGORY": "default"
      }
    }
  }
}
```

**Using local installation (macOS/Linux):**

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "node",
      "args": ["/absolute/path/to/multi-memory-mcp/dist/index.js"],
      "env": {
        "MEMORY_BASE_DIR": "/Users/yourname/.memory",
        "DEFAULT_CATEGORY": "default"
      }
    }
  }
}
```

**Using local installation (Windows):**

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "node",
      "args": ["C:\\path\\to\\multi-memory-mcp\\dist\\index.js"],
      "env": {
        "MEMORY_BASE_DIR": "C:\\Users\\yourname\\.memory",
        "DEFAULT_CATEGORY": "default"
      }
    }
  }
}
```

### Environment Variables

- `MEMORY_BASE_DIR`: Base directory for all memory categories (default: `.aim` in current working directory)
- `DEFAULT_CATEGORY`: Default category when none specified (default: `"default"`)
- `SERIALIZATION_FORMAT`: Output format for tool responses (default: `"json"`)
  - `json` - Standard JSON with 2-space indentation
  - `toon` - TOON (Token-Oriented Object Notation) - compact format optimized for LLMs with 30-60% fewer tokens

### TOON Format

When `SERIALIZATION_FORMAT=toon`, responses use TOON format which is more token-efficient for LLM contexts.

**Structure:**
- Objects: `key: value` with 2-space indentation for nesting
- Arrays: `name[count]{field1,field2}:` followed by comma-separated rows
- Primitives: unquoted unless containing special characters

**Escaping rules** (only these escape sequences are valid):
- `\\` - backslash
- `\"` - double quote
- `\n` - newline
- `\r` - carriage return
- `\t` - tab

**Quoting required when:** empty string, leading/trailing spaces, matches `true`/`false`/`null`, numeric, or contains `: " \ [ ] { } ,`

**Example JSON vs TOON:**

JSON (standard):
```json
{
  "entities": [
    {"id": "1", "name": "AuthService", "entityType": "module", "observations": []}
  ]
}
```

TOON (compact):
```
entities[1]{id,name,entityType,observations}:
  1,AuthService,module,[]
```

See [TOON specification](https://github.com/toon-format/spec) for full format details.

## Database Schema

Each category stores data in a separate SQLite database with the following schema:

### Tables

#### `entities`
Primary storage for graph nodes.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique entity identifier |
| `name` | TEXT NOT NULL | Entity name |
| `entity_type` | TEXT NOT NULL | Entity classification type |
| `properties` | TEXT | JSON properties (searchable) |
| `created_at` | INTEGER | Unix timestamp of creation |
| `updated_at` | INTEGER | Unix timestamp of last update |

**Unique Constraint:** `(name, entity_type)` - entities are identified by name+type combination

#### `observations`
Facts and notes associated with entities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique observation identifier |
| `entity_id` | INTEGER NOT NULL | **Foreign key** to `entities(id)` |
| `observation_type` | TEXT NOT NULL DEFAULT '' | Type/category of observation |
| `content` | TEXT NOT NULL | Observation text |
| `timestamp` | TEXT | ISO 8601 timestamp |
| `source` | TEXT NOT NULL DEFAULT '' | Origin of observation |
| `properties` | TEXT | JSON properties (searchable) |
| `created_at` | INTEGER | Unix timestamp of creation |

**Foreign Key:** `entity_id` → `entities(id)` ON DELETE CASCADE

**Unique Constraint:** `(entity_id, observation_type, source)` - one observation per type+source per entity

#### `relations`
Directed connections between entities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique relation identifier |
| `from_entity_id` | INTEGER NOT NULL | **Foreign key** to `entities(id)` - source entity |
| `to_entity_id` | INTEGER NOT NULL | **Foreign key** to `entities(id)` - target entity |
| `relation_type` | TEXT NOT NULL | Type of relationship |
| `properties` | TEXT | JSON properties |
| `created_at` | INTEGER | Unix timestamp of creation |

**Foreign Keys:**
- `from_entity_id` → `entities(id)` ON DELETE CASCADE
- `to_entity_id` → `entities(id)` ON DELETE CASCADE

**Unique Constraint:** `(from_entity_id, to_entity_id, relation_type)`

### Indexes

- `idx_entities_name` - Fast lookup by entity name
- `idx_entities_type` - Fast lookup by entity type
- `idx_entities_name_type` - Fast lookup by name+type combination
- `idx_observations_entity` - Fast lookup of observations by entity
- `idx_relations_from` - Fast lookup by source entity
- `idx_relations_to` - Fast lookup by target entity
- `idx_relations_type` - Fast lookup by relation type

### Entity Relationship Diagram

```
┌─────────────────┐
│    entities     │
├─────────────────┤
│ id (PK)         │◄─────────────┬──────────────┐
│ name            │              │              │
│ entity_type     │              │              │
│ created_at      │              │              │
│ updated_at      │              │              │
└─────────────────┘              │              │
                                 │              │
┌─────────────────┐              │              │
│  observations   │              │              │
├─────────────────┤              │              │
│ id (PK)         │              │              │
│ entity_id (FK)  │──────────────┘              │
│ content         │  (ON DELETE CASCADE)        │
│ timestamp       │                             │
│ source          │                             │
│ created_at      │                             │
└─────────────────┘                             │
                                                │
┌─────────────────┐                             │
│   relations     │                             │
├─────────────────┤                             │
│ id (PK)         │                             │
│ from_entity_id  │─────────────────────────────┤
│ to_entity_id    │─────────────────────────────┘
│ relation_type   │  (Both FK: ON DELETE CASCADE)
│ created_at      │
└─────────────────┘
```

**Notes:**
- All IDs are auto-generated integers
- Deleting an entity cascades to delete all its observations and relations
- Relations store entity IDs, but API accepts name/type which is resolved to IDs

## Core Concepts

### Categories

Organize memories into separate isolated databases. Each category has its own SQLite database file.

**Category naming rules:**
- Lowercase letters, numbers, hyphens, underscores only
- Cannot start with dots
- Examples: `work`, `personal`, `project-alpha`, `dependencies`

**Directory structure:**
```
.memory/
├── work.db
├── personal.db
└── project-alpha.db
```

### Entities

Nodes in the knowledge graph with:
- **id** - Unique numeric identifier (auto-generated)
- **name** - Human-readable identifier
- **entityType** - Classification (e.g., "module", "class", "person", "project")
- **observations** - List of facts with metadata

```json
{
  "id": "1",
  "name": "AuthService",
  "entityType": "module",
  "observations": [
    {
      "id": "1",
      "observationType": "description",
      "text": "Handles authentication",
      "timestamp": "2025-11-19T10:30:00Z",
      "source": "code-analysis"
    },
    {
      "id": "2",
      "observationType": "location",
      "text": "Located in src/auth/",
      "timestamp": "2025-11-19T10:31:00Z",
      "source": "code-analysis"
    }
  ]
}
```

### Relations

Directed connections between entities with their own IDs:

```json
{
  "id": "1",
  "from": "APIController",
  "fromType": "controller",
  "to": "AuthService",
  "toType": "module",
  "relationType": "depends_on"
}
```

### Dual Identification

All operations support identifying objects by either:
- **ID** - Fast, precise, unambiguous
- **Name/Type** - Human-friendly composite key

This allows flexibility when you have the ID (e.g., from a previous response) or need to reference by name.

## API Tools

All tools accept optional `category` parameter (defaults to `DEFAULT_CATEGORY`).

---

### create_entities

Create new entities in the knowledge graph.

**Input:**
```json
{
  "category": "work",
  "override": false,
  "entities": [
    {
      "name": "UserService",
      "entityType": "service",
      "properties": {
        "filePath": "/src/services/user.ts",
        "tags": ["core", "authentication"]
      },
      "observations": [
        {
          "observationType": "description",
          "text": "Manages user data",
          "timestamp": "2025-11-19T10:00:00Z",
          "source": "code-analysis",
          "properties": {
            "confidence": 0.95,
            "lineNumber": 42
          }
        }
      ]
    }
  ]
}
```
*Notes:*
- `entityType` defaults to empty string
- Observations are unique by (entity, observationType, source)
- `properties` is optional JSON for custom metadata (searchable)
- `override: true` replaces existing entities instead of skipping them

**Output:**
```json
[
  {
    "id": "1",
    "name": "UserService",
    "entityType": "service",
    "properties": {
      "filePath": "/src/services/user.ts",
      "tags": ["core", "authentication"]
    },
    "observations": [
      {
        "id": "1",
        "observationType": "description",
        "text": "Manages user data",
        "timestamp": "2025-11-19T10:00:00Z",
        "source": "code-analysis",
        "properties": {
          "confidence": 0.95,
          "lineNumber": 42
        }
      }
    ]
  }
]
```

---

### create_relations

Create relationships between entities. Each endpoint can be specified by ID or name/type.

**Input (using name/type):**
```json
{
  "category": "work",
  "override": false,
  "relations": [
    {
      "from": {
        "name": "APIController",
        "type": "controller"
      },
      "to": {
        "name": "UserService",
        "type": "service"
      },
      "relationType": "uses",
      "properties": {
        "weight": 0.8,
        "since": "2024-01-01"
      }
    }
  ]
}
```
*Notes:*
- `type` defaults to empty string if not provided
- `properties` is optional JSON for custom metadata
- `override: true` updates existing relations instead of skipping them

**Input (using IDs):**
```json
{
  "category": "work",
  "relations": [
    {
      "from": { "id": "1" },
      "to": { "id": "2" },
      "relationType": "uses"
    }
  ]
}
```
*Note: You can mix ID and name/type - e.g., `from` by ID and `to` by name/type.*

**Output:**
```json
[
  {
    "id": "1",
    "from": "APIController",
    "fromType": "controller",
    "to": "UserService",
    "toType": "service",
    "relationType": "uses",
    "properties": {
      "weight": 0.8,
      "since": "2024-01-01"
    }
  }
]
```

---

### add_observations

Add observations to existing entities. Entity can be identified by ID or name/type.

**Input (using name/type):**
```json
{
  "category": "work",
  "override": false,
  "observations": [
    {
      "entityName": "UserService",
      "entityType": "service",
      "contents": [
        {
          "observationType": "version",
          "text": "Updated to v2.0",
          "timestamp": "2025-11-19T14:30:00Z",
          "source": "changelog",
          "properties": {
            "semver": "2.0.0",
            "breaking": true
          }
        },
        {
          "observationType": "feature",
          "text": "Added caching",
          "source": "changelog"
        }
      ]
    }
  ]
}
```
*Note: `override: true` updates existing observations (matched by observationType+source) instead of skipping them.*

**Input (using entity ID):**
```json
{
  "category": "work",
  "observations": [
    {
      "entityId": "1",
      "contents": [
        {
          "observationType": "version",
          "text": "Updated to v2.0",
          "timestamp": "2025-11-19T14:30:00Z",
          "source": "release-notes"
        }
      ]
    }
  ]
}
```

**Output:**
```json
[
  {
    "entityId": "1",
    "entityName": "UserService",
    "entityType": "service",
    "addedObservations": [
      {
        "id": "3",
        "observationType": "version",
        "text": "Updated to v2.0",
        "timestamp": "2025-11-19T14:30:00Z",
        "source": "changelog",
        "properties": {
          "semver": "2.0.0",
          "breaking": true
        }
      },
      {
        "id": "4",
        "observationType": "feature",
        "text": "Added caching",
        "timestamp": "2025-11-19T14:30:01Z",
        "source": "changelog"
      }
    ]
  }
]
```

---

### delete_entities

Delete entities and their relations. Identify by ID or name/type.

**Input (using name/type):**
```json
{
  "category": "work",
  "entities": [
    {
      "name": "UserService",
      "entityType": "service"
    }
  ]
}
```

**Input (using ID):**
```json
{
  "category": "work",
  "entities": [
    { "id": "1" }
  ]
}
```

**Output:**
```
"Entities deleted successfully"
```

---

### delete_observations

Delete specific observations. Identify by observation ID or by entity + observationType + source.

**Input (using observation ID):**
```json
{
  "category": "work",
  "deletions": [
    { "id": "3" }
  ]
}
```

**Input (using entity name + observationType + source):**
```json
{
  "category": "work",
  "deletions": [
    {
      "entityName": "UserService",
      "entityType": "service",
      "observationType": "version",
      "source": "changelog"
    }
  ]
}
```

**Input (using entity ID + observationType + source):**
```json
{
  "category": "work",
  "deletions": [
    {
      "entityId": "1",
      "observationType": "version",
      "source": "changelog"
    }
  ]
}
```

**Output:**
```
"Observations deleted successfully"
```

---

### delete_relations

Delete relations. Identify by relation ID or composite key.

**Input (using relation ID):**
```json
{
  "category": "work",
  "relations": [
    { "id": "1" }
  ]
}
```

**Input (using composite key):**
```json
{
  "category": "work",
  "relations": [
    {
      "from": "APIController",
      "fromType": "controller",
      "to": "UserService",
      "toType": "service",
      "relationType": "uses"
    }
  ]
}
```

**Output:**
```
"Relations deleted successfully"
```

---

### read_graph

Get entire knowledge graph for a category.

**Input:**
```json
{
  "category": "work"
}
```

**Output:**
```json
{
  "entities": [
    {
      "id": "1",
      "name": "UserService",
      "entityType": "service",
      "observations": [
        {
          "id": "1",
          "text": "Manages user data",
          "timestamp": "2025-11-19T10:00:00Z"
        }
      ]
    }
  ],
  "relations": [
    {
      "id": "1",
      "from": "APIController",
      "fromType": "controller",
      "to": "UserService",
      "toType": "service",
      "relationType": "uses"
    }
  ]
}
```

---

### search_nodes

Search by name, type, observation content, or properties (all searchable via FTS5).

**Input:**
```json
{
  "category": "work",
  "query": "authentication"
}
```

**Output:**
```json
{
  "entities": [
    {
      "id": "2",
      "name": "AuthService",
      "entityType": "service",
      "observations": [
        {
          "id": "5",
          "text": "Handles authentication",
          "timestamp": "2025-11-19T10:30:00Z"
        }
      ]
    }
  ],
  "relations": [
    {
      "id": "3",
      "from": "APIController",
      "fromType": "controller",
      "to": "AuthService",
      "toType": "service",
      "relationType": "uses"
    }
  ]
}
```

---

### open_nodes

Get specific entities. Identify by ID or name/type.

**Input (using name/type):**
```json
{
  "category": "work",
  "entities": [
    {
      "name": "UserService",
      "entityType": "service"
    },
    {
      "name": "AuthService",
      "entityType": "service"
    }
  ]
}
```

**Input (using IDs):**
```json
{
  "category": "work",
  "entities": [
    { "id": "1" },
    { "id": "2" }
  ]
}
```

**Output:**
```json
{
  "entities": [
    {
      "id": "1",
      "name": "UserService",
      "entityType": "service",
      "observations": [...]
    },
    {
      "id": "2",
      "name": "AuthService",
      "entityType": "service",
      "observations": [...]
    }
  ],
  "relations": [
    {
      "id": "2",
      "from": "UserService",
      "fromType": "service",
      "to": "AuthService",
      "toType": "service",
      "relationType": "depends_on"
    }
  ]
}
```

---

### list_categories

Get all available category names.

**Input:**
```json
{}
```

**Output:**
```json
["work", "personal", "project-alpha"]
```

---

### delete_category

Delete entire category and its database.

**Input:**
```json
{
  "category": "old-project"
}
```

**Output:**
```
"Category 'old-project' deleted successfully"
```

---

## Use Cases

### Code Dependency Tracking

Track module dependencies per project:

```json
{
  "category": "backend-service",
  "entities": [
    {
      "name": "AuthModule",
      "entityType": "module",
      "observations": [
        {
          "text": "Exports login, logout",
          "source": "code-analysis"
        }
      ]
    },
    {
      "name": "UserModule",
      "entityType": "module",
      "observations": [
        {
          "text": "User CRUD operations",
          "source": "documentation"
        }
      ]
    },
    {
      "name": "Database",
      "entityType": "library",
      "observations": [
        {
          "text": "PostgreSQL client"
        }
      ]
    }
  ]
}
```

Then create relations:
```json
{
  "category": "backend-service",
  "relations": [
    {
      "from": { "name": "AuthModule", "type": "module" },
      "to": { "name": "UserModule", "type": "module" },
      "relationType": "imports"
    },
    {
      "from": { "name": "AuthModule", "type": "module" },
      "to": { "name": "Database", "type": "library" },
      "relationType": "uses"
    }
  ]
}
```

Query dependencies:
```json
{"category": "backend-service", "query": "AuthModule"}
```

### Multi-Project Organization

Separate categories per project:
- `project-frontend` - Frontend dependencies
- `project-backend` - Backend dependencies
- `project-mobile` - Mobile app dependencies

### Work/Personal Separation

Keep contexts isolated:
- `work` - Professional contacts and projects
- `personal` - Personal notes and relationships
- `learning` - Study notes and resources

## Development

### Build

```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
```

### Testing

```bash
npm test           # Run all tests (141 tests)
```

Coverage: SQLiteStorage 98%, CategoryManager 87%, KnowledgeGraphManager 100%

### Project Structure

```
src/
├── index.ts                    # MCP server
├── storage/
│   └── SQLiteStorage.ts        # Database operations
├── managers/
│   ├── CategoryManager.ts      # Category lifecycle & LRU cache
│   └── KnowledgeGraphManager.ts # Graph operations
└── types/
    └── graph.ts                # Type definitions

tests/
├── storage/                    # Storage layer tests
├── managers/                   # Manager tests
├── integration/                # End-to-end tests
└── benchmarks/                 # Performance benchmarks
```

## Technical Details

### Storage

- **Database**: SQLite 3 with WAL mode
- **Schema**: Single version, clean slate
- **Indexes**: On entity names, types, relations
- **Transactions**: ACID-compliant operations
- **Connection Limit**: Max 50 concurrent (LRU eviction)

### Security

- Parameterized queries (SQL injection protection)
- Category name validation (path traversal prevention)
- Foreign key constraints
- Cascading deletes

### Performance

- Indexed queries for fast lookups
- WAL mode for concurrent reads
- Connection caching with LRU eviction
- Batch operations via transactions

## Troubleshooting

### Database locked error

SQLite uses WAL mode which allows concurrent reads. If you get lock errors:
- Ensure no other process is writing to the database
- Check file permissions on the database directory

### Memory growing over time

CategoryManager implements LRU cache with default 50 connection limit. Oldest connections automatically closed when limit reached.

## License

MIT License

Original work Copyright (c) 2025 Anthropic, PBC
Modified work Copyright (c) 2025 DanNsk

Based on `@modelcontextprotocol/server-memory`

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
