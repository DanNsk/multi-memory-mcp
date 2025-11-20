# Multi-Memory MCP Server

A multi-category knowledge graph memory server using SQLite for persistent storage. Organize memories into isolated contexts for different purposes (work, personal, projects, etc.).

**Based on** `@modelcontextprotocol/server-memory` **with enhancements:**
- SQLite database storage with proper indexing and transactions
- Multi-category support with isolated memory contexts
- LRU connection cache (prevents memory leaks)
- Schema versioning system
- SQL injection protection
- Full test coverage (134 tests)

## Quick Start

### Run Directly with bunx (No Installation Required)

The fastest way to use multi-memory-mcp is to run it directly from GitHub using `bunx`:

```bash
bunx github:DanNsk/multi-memory-mcp
```

This will download, build, and run the server automatically. Perfect for trying it out or using in Claude Desktop config:

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "bunx",
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
bun install
bun run build
```

### Configuration

Add to Claude Desktop config:

**Config file locations:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Using bunx (recommended):**

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "bunx",
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
    {"name": "AuthService", "entityType": "module", "observations": []}
  ]
}
```

TOON (compact):
```
entities[1]{name,entityType,observations}:
  AuthService,module,[]
```

See [TOON specification](https://github.com/toon-format/spec) for full format details.

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
- Unique name (identifier)
- Type (e.g., "module", "class", "person", "project")
- List of observations (structured with text, timestamp, and source)

```json
{
  "name": "AuthService",
  "entityType": "module",
  "observations": [
    {
      "text": "Handles authentication",
      "timestamp": "2025-11-19T10:30:00Z",
      "source": "code-analysis"
    },
    {
      "text": "Located in src/auth/",
      "timestamp": "2025-11-19T10:31:00Z"
    }
  ]
}
```

### Relations

Directed connections between entities (active voice):

```json
{
  "from": "APIController",
  "to": "AuthService",
  "relationType": "depends_on"
}
```

### Observations

Atomic facts about entities with rich metadata:

```json
{
  "entityName": "AuthService",
  "observations": [
    {
      "text": "Uses JWT tokens",
      "timestamp": "2025-11-19T10:30:00Z",
      "source": "code-analysis"
    },
    {
      "text": "Connects to user database",
      "timestamp": "2025-11-19T10:31:15Z"
    },
    {
      "text": "Critical for security - requires review"
    }
  ]
}
```

**Observation fields:**
- `text` (required): The observation content
- `timestamp` (optional): ISO 8601 timestamp, defaults to current time if not provided
- `source` (optional): Source indicator (e.g., "code-analysis", "user-input", "documentation")

## API Tools

All tools accept optional `category` parameter (defaults to `DEFAULT_CATEGORY`).

### Entity Operations

**create_entities** - Create new entities
```json
{
  "category": "work",
  "entities": [
    {
      "name": "UserService",
      "entityType": "service",
      "observations": [
        {
          "text": "Manages user data",
          "source": "code-analysis"
        }
      ]
    }
  ]
}
```

**delete_entities** - Remove entities and their relations
```json
{
  "category": "work",
  "entityNames": ["UserService"]
}
```

### Relation Operations

**create_relations** - Create entity relationships
```json
{
  "category": "work",
  "relations": [
    {
      "from": "APIController",
      "to": "UserService",
      "relationType": "uses"
    }
  ]
}
```

**delete_relations** - Remove specific relations

### Observation Operations

**add_observations** - Add facts to existing entities
```json
{
  "category": "work",
  "observations": [
    {
      "entityName": "UserService",
      "contents": [
        {
          "text": "Updated to v2.0",
          "timestamp": "2025-11-19T14:30:00Z",
          "source": "code-analysis"
        },
        {
          "text": "Added caching"
        }
      ]
    }
  ]
}
```

**delete_observations** - Remove specific observations

### Query Operations

**read_graph** - Get entire graph for a category
```json
{
  "category": "work"
}
```

**search_nodes** - Search by name, type, or observation content
```json
{
  "category": "work",
  "query": "authentication"
}
```

**open_nodes** - Get specific entities by name
```json
{
  "category": "work",
  "names": ["UserService", "AuthService"]
}
```

### Category Management

**list_categories** - Get all category names

**delete_category** - Remove entire category and database
```json
{
  "category": "old-project"
}
```

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
  ],
  "relations": [
    {"from": "AuthModule", "to": "UserModule", "relationType": "imports"},
    {"from": "AuthModule", "to": "Database", "relationType": "uses"}
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
bun run build      # Compile TypeScript
bun run watch      # Watch mode
```

### Testing

```bash
bun test           # Run all tests (134 tests)
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
- **Schema Version**: 2 (tracked in database, auto-migrates from v1)
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

### Schema version mismatch

Database created with different schema version. No automatic migration implemented. Delete old database or manually migrate.

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
