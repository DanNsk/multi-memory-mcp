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

### Installation

```bash
git clone https://github.com/DanNsk/multi-memory-mcp
cd multi-memory-mcp
npm install
npm run build
```

### Configuration

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

### Environment Variables

- `MEMORY_BASE_DIR`: Base directory for all memory categories (default: `./memory`)
- `DEFAULT_CATEGORY`: Default category when none specified (default: `"default"`)

## Core Concepts

### Categories

Organize memories into separate isolated databases. Each category has its own SQLite database file.

**Category naming rules:**
- Lowercase letters, numbers, hyphens, underscores only
- Cannot start with dots
- Examples: `work`, `personal`, `project-alpha`, `dependencies`

**Directory structure:**
```
memory/
├── work/work.db
├── personal/personal.db
└── project-alpha/project-alpha.db
```

### Entities

Nodes in the knowledge graph with:
- Unique name (identifier)
- Type (e.g., "module", "class", "person", "project")
- List of observations

```json
{
  "name": "AuthService",
  "entityType": "module",
  "observations": ["Handles authentication", "Located in src/auth/"]
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

Atomic facts about entities:

```json
{
  "entityName": "AuthService",
  "observations": [
    "Uses JWT tokens",
    "Connects to user database",
    "Implements password hashing"
  ]
}
```

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
      "observations": ["Manages user data"]
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
      "contents": ["Updated to v2.0", "Added caching"]
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
    {"name": "AuthModule", "entityType": "module", "observations": ["Exports login, logout"]},
    {"name": "UserModule", "entityType": "module", "observations": ["User CRUD operations"]},
    {"name": "Database", "entityType": "library", "observations": ["PostgreSQL client"]}
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
npm run build      # Compile TypeScript
npm run watch      # Watch mode
```

### Testing

```bash
npm test           # Run all tests (134 tests)
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
- **Schema Version**: 1 (tracked in database)
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
