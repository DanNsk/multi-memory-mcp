# Feature Request: Full-Text Search (FTS)

## Overview

Add full-text search capabilities to the multi-memory-mcp knowledge graph using SQLite's FTS5 extension.

## Motivation

Currently, the `searchNodes` method performs simple `LIKE` pattern matching which:
- Is case-insensitive but limited to substring matches
- Doesn't support advanced queries (AND, OR, NOT, phrases)
- Doesn't rank results by relevance
- Performs poorly on large datasets

FTS5 would provide:
- Faster searches on large datasets
- Relevance ranking (BM25 algorithm)
- Advanced query syntax
- Phrase and proximity searches
- Prefix matching

## Proposed Implementation

### 1. Create FTS Virtual Table

```sql
-- Create FTS5 virtual table for searchable content
CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
  entity_name,
  entity_type,
  observation_content,
  content='',  -- External content table
  content_rowid='id'
);

-- Index for synchronization
CREATE TABLE IF NOT EXISTS fts_index (
  id INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL,
  observation_id INTEGER,
  entity_name TEXT,
  entity_type TEXT,
  observation_content TEXT,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);
```

### 2. Keep FTS Index Synchronized

Use triggers to maintain FTS index:

```sql
-- Trigger: After entity insert
CREATE TRIGGER fts_entity_insert AFTER INSERT ON entities BEGIN
  INSERT INTO fts_index (entity_id, entity_name, entity_type)
  VALUES (NEW.id, NEW.name, NEW.entity_type);

  INSERT INTO fts_content (rowid, entity_name, entity_type, observation_content)
  VALUES (last_insert_rowid(), NEW.name, NEW.entity_type, '');
END;

-- Trigger: After observation insert
CREATE TRIGGER fts_observation_insert AFTER INSERT ON observations BEGIN
  INSERT INTO fts_index (entity_id, observation_id, observation_content)
  VALUES (NEW.entity_id, NEW.id, NEW.content);

  -- Update FTS with new observation content
  INSERT INTO fts_content (rowid, entity_name, entity_type, observation_content)
  SELECT fi.id, fi.entity_name, fi.entity_type, NEW.content
  FROM fts_index fi WHERE fi.observation_id = NEW.id;
END;

-- Similar triggers for UPDATE and DELETE
```

### 3. Enhanced Search Method

```typescript
async searchNodesFTS(query: string, options?: {
  matchType?: 'all' | 'any' | 'phrase';
  limit?: number;
  offset?: number;
}): Promise<KnowledgeGraph & { scores: Map<string, number> }> {
  const ftsQuery = this.buildFTSQuery(query, options?.matchType);

  const results = this.db.prepare(`
    SELECT
      fi.entity_id,
      bm25(fts_content) as score
    FROM fts_content
    JOIN fts_index fi ON fts_content.rowid = fi.id
    WHERE fts_content MATCH ?
    ORDER BY score
    LIMIT ? OFFSET ?
  `).all(ftsQuery, options?.limit ?? 100, options?.offset ?? 0);

  // Fetch full entities and relations...
}
```

### 4. Query Syntax Support

FTS5 query examples:
- `authentication` - simple term
- `user AND auth` - both terms required
- `"user authentication"` - exact phrase
- `auth*` - prefix match
- `NEAR(user auth, 5)` - proximity search

### 5. MCP Tool Addition

Add new `search_nodes_fts` tool:

```json
{
  "name": "search_nodes_fts",
  "description": "Full-text search across entities and observations with ranking",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": { "type": "string" },
      "query": { "type": "string", "description": "FTS5 query string" },
      "match_type": {
        "type": "string",
        "enum": ["all", "any", "phrase"],
        "default": "all"
      },
      "limit": { "type": "number", "default": 100 },
      "highlight": { "type": "boolean", "default": false }
    },
    "required": ["query"]
  }
}
```

## Implementation Steps

1. **Schema Migration**
   - Add FTS5 virtual table and index table
   - Create synchronization triggers
   - Rebuild FTS index from existing data

2. **Storage Layer**
   - Add `searchNodesFTS()` method
   - Add `rebuildFTSIndex()` for maintenance
   - Add query builder for different match types

3. **MCP Integration**
   - Add new `search_nodes_fts` tool
   - Consider deprecating or enhancing existing `search_nodes`

4. **Testing**
   - Unit tests for FTS queries
   - Performance benchmarks vs LIKE queries
   - Test index synchronization

## Considerations

### Performance
- FTS5 uses ~1-2x the size of original text for index
- Rebuild index on large imports may take time
- Consider background indexing for large batches

### Backward Compatibility
- Keep existing `search_nodes` for simple searches
- New FTS tool is additive, not replacement

### Storage Impact
- FTS index adds ~50-100% storage overhead
- Can be disabled per-category if needed

## Alternative Approaches

1. **External Search Engine** (Elasticsearch, Meilisearch)
   - More powerful but adds dependency
   - Better for very large datasets

2. **SQLite FTS4**
   - Older, less features
   - Slightly smaller index size

3. **Application-level indexing**
   - Custom inverted index
   - More control but more code

## References

- [SQLite FTS5 Documentation](https://sqlite.org/fts5.html)
- [BM25 Ranking](https://sqlite.org/fts5.html#the_bm25_function)
- [FTS5 Query Syntax](https://sqlite.org/fts5.html#full_text_query_syntax)
