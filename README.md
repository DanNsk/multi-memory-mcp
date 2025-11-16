# Multi-Memory MCP Server

A multi-category knowledge graph memory server using SQLite for persistent storage. This lets Claude remember information across chats with isolated memory contexts for different purposes.

**Based on** `@modelcontextprotocol/server-memory` **with the following enhancements:**
- SQLite database storage with proper indexing
- Multi-category support (work, personal, projects, etc.)
- Isolated memory contexts per category
- Faster search and queries
- ACID transactions for data integrity

## Core Concepts

### Categories

Categories allow you to organize memories into separate contexts. Each category has its own isolated database.

**Common categories:**
- `work` - Work-related memories
- `personal` - Personal memories
- `project-alpha` - Project-specific knowledge
- `dependencies` - Code dependency graphs
- Any custom category name (lowercase, alphanumeric, hyphens, underscores)

**Directory structure:**
```
memory/
├── work/
│   └── work.db
├── personal/
│   └── personal.db
└── project-alpha/
    └── project-alpha.db
```

### Entities

Entities are the primary nodes in the knowledge graph. Each entity has:
- A unique name (identifier)
- An entity type (e.g., "person", "organization", "event", "module", "class")
- A list of observations

Example:
```json
{
  "name": "UserService",
  "entityType": "module",
  "observations": ["Handles user authentication", "Located in src/services/"]
}
```

### Relations

Relations define directed connections between entities. They are always stored in active voice and describe how entities interact or relate to each other.

Example:
```json
{
  "from": "APIController",
  "to": "UserService",
  "relationType": "depends_on"
}
```

### Observations

Observations are discrete pieces of information about an entity. They are:
- Stored as strings
- Attached to specific entities
- Can be added or removed independently
- Should be atomic (one fact per observation)

Example:
```json
{
  "entityName": "UserService",
  "observations": [
    "Exports createUser function",
    "Uses bcrypt for password hashing",
    "Connects to PostgreSQL database"
  ]
}
```

## API

### Tools

All tools support an optional `category` parameter. If not provided, the default category is used.

#### **create_entities**
Create multiple new entities in the knowledge graph

**Input:**
- `category` (optional, string): Memory category (defaults to "default")
- `entities` (array): Array of entity objects
  - `name` (string): Entity identifier
  - `entityType` (string): Type classification
  - `observations` (string[]): Associated observations

Ignores entities with existing names.

**Example:**
```json
{
  "category": "work",
  "entities": [
    {
      "name": "DatabaseClient",
      "entityType": "module",
      "observations": ["PostgreSQL client wrapper", "Handles connection pooling"]
    }
  ]
}
```

#### **create_relations**
Create multiple new relations between entities

**Input:**
- `category` (optional, string): Memory category
- `relations` (array): Array of relation objects
  - `from` (string): Source entity name
  - `to` (string): Target entity name
  - `relationType` (string): Relationship type in active voice

Skips duplicate relations.

**Example:**
```json
{
  "category": "work",
  "relations": [
    {
      "from": "UserService",
      "to": "DatabaseClient",
      "relationType": "depends_on"
    }
  ]
}
```

#### **add_observations**
Add new observations to existing entities

**Input:**
- `category` (optional, string): Memory category
- `observations` (array): Array of observation objects
  - `entityName` (string): Target entity
  - `contents` (string[]): New observations to add

Returns added observations per entity. Fails if entity doesn't exist.

#### **delete_entities**
Remove entities and their relations

**Input:**
- `category` (optional, string): Memory category
- `entityNames` (string[]): Array of entity names to delete

Cascading deletion of associated relations. Silent if entity doesn't exist.

#### **delete_observations**
Remove specific observations from entities

**Input:**
- `category` (optional, string): Memory category
- `deletions` (array): Array of deletion objects
  - `entityName` (string): Target entity
  - `observations` (string[]): Observations to remove

Silent if observation doesn't exist.

#### **delete_relations**
Remove specific relations from the graph

**Input:**
- `category` (optional, string): Memory category
- `relations` (array): Array of relation objects to delete

Silent if relation doesn't exist.

#### **read_graph**
Read the entire knowledge graph from a category

**Input:**
- `category` (optional, string): Memory category

Returns complete graph structure with all entities and relations for the specified category.

#### **search_nodes**
Search for nodes based on query

**Input:**
- `category` (optional, string): Memory category
- `query` (string): Search query

Searches across entity names, entity types, and observation content. Returns matching entities and their relations.

#### **open_nodes**
Retrieve specific nodes by name

**Input:**
- `category` (optional, string): Memory category
- `names` (string[]): Entity names to retrieve

Returns requested entities and relations between them. Silently skips non-existent nodes.

#### **list_categories**
List all available memory categories

**Input:** None

Returns array of category names.

#### **delete_category**
Delete an entire category and all its contents

**Input:**
- `category` (string, required): Category to delete

Permanently removes the category directory and database.

## Configuration

### Environment Variables

- `MEMORY_BASE_DIR`: Base directory for all memory categories (default: `./memory` relative to server)
- `DEFAULT_CATEGORY`: Default category name when not specified (default: `"default"`)

### Usage with Claude Desktop

#### NPX Installation

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "npx",
      "args": ["-y", "multi-memory-mcp"],
      "env": {
        "MEMORY_BASE_DIR": "/Users/yourname/.memory",
        "DEFAULT_CATEGORY": "default"
      }
    }
  }
}
```

#### Local Development

```json
{
  "mcpServers": {
    "multi-memory": {
      "command": "node",
      "args": ["/path/to/multi-memory-mcp/dist/index.js"],
      "env": {
        "MEMORY_BASE_DIR": "/Users/yourname/.memory",
        "DEFAULT_CATEGORY": "work"
      }
    }
  }
}
```

## Building and Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Run Locally

```bash
node dist/index.js
```

## Use Cases

### Personal Assistant Memory

Separate work and personal contexts:

```json
// Work context
{
  "category": "work",
  "entities": [{
    "name": "Alice",
    "entityType": "colleague",
    "observations": ["Project lead", "Prefers morning meetings"]
  }]
}

// Personal context
{
  "category": "personal",
  "entities": [{
    "name": "Alice",
    "entityType": "friend",
    "observations": ["Enjoys hiking", "Birthday in June"]
  }]
}
```

### Code Dependency Tracking

Store ASG (Abstract Semantic Graph) for different projects:

```json
{
  "category": "project-frontend",
  "entities": [
    {
      "name": "AuthService",
      "entityType": "service",
      "observations": ["Handles OAuth flow", "Uses JWT tokens"]
    },
    {
      "name": "UserAPI",
      "entityType": "api",
      "observations": ["REST endpoints for user management"]
    }
  ],
  "relations": [
    {
      "from": "UserAPI",
      "to": "AuthService",
      "relationType": "depends_on"
    }
  ]
}
```

### Project-Specific Knowledge

Isolate memories per project:

```json
// Project Alpha memories
{
  "category": "project-alpha",
  "entities": [...]
}

// Project Beta memories
{
  "category": "project-beta",
  "entities": [...]
}
```

## Storage Details

- **Database**: SQLite with WAL mode for better concurrency
- **Schema**: Indexed tables for entities, observations, and relations
- **Transactions**: ACID-compliant operations
- **File Location**: Each category stored in `{MEMORY_BASE_DIR}/{category}/{category}.db`

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
