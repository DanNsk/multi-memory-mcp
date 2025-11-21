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
import Database from 'better-sqlite3';
// Current schema version - increment when making schema changes
const SCHEMA_VERSION = 2;
export class SQLiteStorage {
    db;
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
        this.initializeSchema();
        this.upgradeSchema();
    }
    initializeSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(name, entity_type)
      );

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL,
        observation_type TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        timestamp TEXT,
        source TEXT NOT NULL DEFAULT '',
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(entity_id, observation_type, source)
      );

      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id INTEGER NOT NULL,
        to_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(from_entity_id, to_entity_id, relation_type)
      );

      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_entities_name_type ON entities(name, entity_type);
      CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);

      -- Schema version tracking
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );
    `);
    }
    getSchemaVersion() {
        const row = this.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
        return row?.version ?? 0;
    }
    setSchemaVersion(version) {
        this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(version);
    }
    upgradeSchema() {
        const currentVersion = this.getSchemaVersion();
        if (currentVersion < 2) {
            this.upgradeToVersion2();
        }
        if (currentVersion < SCHEMA_VERSION) {
            this.setSchemaVersion(SCHEMA_VERSION);
        }
    }
    upgradeToVersion2() {
        // FTS5 full-text search upgrade
        this.db.exec(`
      -- FTS5 virtual table for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
        entity_name,
        entity_type,
        observation_content
      );

      -- Mapping table to link FTS rowids to entities/observations
      CREATE TABLE IF NOT EXISTS fts_map (
        fts_rowid INTEGER PRIMARY KEY,
        entity_id INTEGER NOT NULL,
        observation_id INTEGER,
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_fts_map_entity ON fts_map(entity_id);
      CREATE INDEX IF NOT EXISTS idx_fts_map_observation ON fts_map(observation_id);
    `);
        // Create triggers to keep FTS index synchronized
        this.db.exec(`
      -- Trigger: After entity insert - create FTS entry for entity
      CREATE TRIGGER IF NOT EXISTS fts_entity_insert AFTER INSERT ON entities BEGIN
        INSERT INTO fts_content (entity_name, entity_type, observation_content)
        VALUES (NEW.name, NEW.entity_type, '');
        INSERT INTO fts_map (fts_rowid, entity_id)
        VALUES (last_insert_rowid(), NEW.id);
      END;

      -- Trigger: After entity update - update FTS entries
      CREATE TRIGGER IF NOT EXISTS fts_entity_update AFTER UPDATE ON entities BEGIN
        -- Update all FTS entries for this entity (entity entry and observation entries)
        UPDATE fts_content SET entity_name = NEW.name, entity_type = NEW.entity_type
        WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE entity_id = NEW.id);
      END;

      -- Trigger: After entity delete - remove FTS entries
      CREATE TRIGGER IF NOT EXISTS fts_entity_delete AFTER DELETE ON entities BEGIN
        DELETE FROM fts_content WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE entity_id = OLD.id);
        DELETE FROM fts_map WHERE entity_id = OLD.id;
      END;

      -- Trigger: After observation insert - create FTS entry for observation
      CREATE TRIGGER IF NOT EXISTS fts_observation_insert AFTER INSERT ON observations BEGIN
        INSERT INTO fts_content (entity_name, entity_type, observation_content)
        SELECT e.name, e.entity_type, NEW.content
        FROM entities e WHERE e.id = NEW.entity_id;
        INSERT INTO fts_map (fts_rowid, entity_id, observation_id)
        VALUES (last_insert_rowid(), NEW.entity_id, NEW.id);
      END;

      -- Trigger: After observation update - update FTS entry
      CREATE TRIGGER IF NOT EXISTS fts_observation_update AFTER UPDATE ON observations BEGIN
        UPDATE fts_content SET observation_content = NEW.content
        WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE observation_id = NEW.id);
      END;

      -- Trigger: After observation delete - remove FTS entry
      CREATE TRIGGER IF NOT EXISTS fts_observation_delete AFTER DELETE ON observations BEGIN
        DELETE FROM fts_content WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE observation_id = OLD.id);
        DELETE FROM fts_map WHERE observation_id = OLD.id;
      END;
    `);
        // Populate FTS index from existing data
        this.rebuildFTSIndex();
    }
    rebuildFTSIndex() {
        // Clear existing FTS data
        this.db.exec('DELETE FROM fts_content');
        this.db.exec('DELETE FROM fts_map');
        // Index all entities (one entry per entity for entity-level search)
        const entities = this.db.prepare('SELECT id, name, entity_type FROM entities').all();
        const insertFts = this.db.prepare('INSERT INTO fts_content (entity_name, entity_type, observation_content) VALUES (?, ?, ?)');
        const insertMap = this.db.prepare('INSERT INTO fts_map (fts_rowid, entity_id, observation_id) VALUES (?, ?, ?)');
        const transaction = this.db.transaction(() => {
            for (const entity of entities) {
                // Insert entity entry
                const result = insertFts.run(entity.name, entity.entity_type, '');
                insertMap.run(result.lastInsertRowid, entity.id, null);
            }
            // Index all observations
            const observations = this.db.prepare(`
        SELECT o.id as obs_id, o.content, e.id as entity_id, e.name, e.entity_type
        FROM observations o
        JOIN entities e ON o.entity_id = e.id
      `).all();
            for (const obs of observations) {
                const result = insertFts.run(obs.name, obs.entity_type, obs.content);
                insertMap.run(result.lastInsertRowid, obs.entity_id, obs.obs_id);
            }
        });
        transaction();
    }
    // Helper method to resolve entity by ID or name/type
    resolveEntity(ref) {
        if (ref.id) {
            const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE id = ?').get(ref.id);
            if (row) {
                return { id: row.id, name: row.name, entityType: row.entity_type };
            }
            return null;
        }
        const name = ref.name;
        const entityType = 'type' in ref ? ref.type : ('entityType' in ref ? ref.entityType : '');
        if (name !== undefined) {
            const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE name = ? AND entity_type = ?').get(name, entityType || '');
            if (row) {
                return { id: row.id, name: row.name, entityType: row.entity_type };
            }
        }
        return null;
    }
    // Helper to get entity by ID
    getEntityById(id) {
        const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE id = ?').get(id);
        if (row) {
            return { id: row.id, name: row.name, entityType: row.entity_type };
        }
        return null;
    }
    async loadGraph() {
        const entities = [];
        const relations = [];
        const entityRows = this.db.prepare('SELECT id, name, entity_type FROM entities').all();
        for (const row of entityRows) {
            const observations = this.db
                .prepare('SELECT id, observation_type, content, timestamp, source FROM observations WHERE entity_id = ?')
                .all(row.id);
            entities.push({
                id: String(row.id),
                name: row.name,
                entityType: row.entity_type,
                observations: observations.map(o => ({
                    id: String(o.id),
                    text: o.content,
                    ...(o.observation_type && { observationType: o.observation_type }),
                    ...(o.timestamp && { timestamp: o.timestamp }),
                    ...(o.source && { source: o.source }),
                })),
            });
        }
        const relationRows = this.db
            .prepare('SELECT id, from_entity_id, to_entity_id, relation_type FROM relations')
            .all();
        for (const row of relationRows) {
            const fromEntity = this.getEntityById(row.from_entity_id);
            const toEntity = this.getEntityById(row.to_entity_id);
            relations.push({
                id: String(row.id),
                fromId: String(row.from_entity_id),
                toId: String(row.to_entity_id),
                relationType: row.relation_type,
                from: fromEntity?.name,
                fromType: fromEntity?.entityType,
                to: toEntity?.name,
                toType: toEntity?.entityType,
            });
        }
        return { entities, relations };
    }
    async createEntities(entities) {
        const insertEntity = this.db.prepare('INSERT OR IGNORE INTO entities (name, entity_type) VALUES (?, ?)');
        const insertObservation = this.db.prepare('INSERT INTO observations (entity_id, observation_type, content, timestamp, source) VALUES (?, ?, ?, ?, ?)');
        const getEntity = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE name = ? AND entity_type = ?');
        const newEntities = [];
        const transaction = this.db.transaction((entitiesToCreate) => {
            for (const entity of entitiesToCreate) {
                const result = insertEntity.run(entity.name, entity.entityType);
                if (result.changes > 0) {
                    const entityRow = getEntity.get(entity.name, entity.entityType);
                    const observationsWithIds = [];
                    for (const observation of entity.observations) {
                        const timestamp = observation.timestamp || new Date().toISOString();
                        const obsResult = insertObservation.run(entityRow.id, observation.observationType || '', observation.text, timestamp, observation.source || '');
                        observationsWithIds.push({
                            id: String(obsResult.lastInsertRowid),
                            text: observation.text,
                            ...(observation.observationType && { observationType: observation.observationType }),
                            timestamp,
                            ...(observation.source && { source: observation.source }),
                        });
                    }
                    newEntities.push({
                        id: String(entityRow.id),
                        name: entity.name,
                        entityType: entity.entityType,
                        observations: observationsWithIds,
                    });
                }
            }
        });
        transaction(entities);
        return newEntities;
    }
    async createRelations(relations) {
        const insertRelation = this.db.prepare('INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type) VALUES (?, ?, ?)');
        const getRelation = this.db.prepare('SELECT id FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?');
        const newRelations = [];
        const transaction = this.db.transaction((relationsToCreate) => {
            for (const relation of relationsToCreate) {
                // Resolve from entity
                const fromEntity = this.resolveEntity(relation.from);
                if (!fromEntity) {
                    const identifier = relation.from.id ? `id '${relation.from.id}'` : `name '${relation.from.name}' with type '${relation.from.type || ''}'`;
                    throw new Error(`Entity with ${identifier} not found`);
                }
                // Resolve to entity
                const toEntity = this.resolveEntity(relation.to);
                if (!toEntity) {
                    const identifier = relation.to.id ? `id '${relation.to.id}'` : `name '${relation.to.name}' with type '${relation.to.type || ''}'`;
                    throw new Error(`Entity with ${identifier} not found`);
                }
                const result = insertRelation.run(fromEntity.id, toEntity.id, relation.relationType);
                if (result.changes > 0) {
                    const relationRow = getRelation.get(fromEntity.id, toEntity.id, relation.relationType);
                    newRelations.push({
                        id: String(relationRow.id),
                        fromId: String(fromEntity.id),
                        toId: String(toEntity.id),
                        relationType: relation.relationType,
                        from: fromEntity.name,
                        fromType: fromEntity.entityType,
                        to: toEntity.name,
                        toType: toEntity.entityType,
                    });
                }
            }
        });
        transaction(relations);
        return newRelations;
    }
    async addObservations(observations) {
        const getExistingObservations = this.db.prepare('SELECT observation_type, source FROM observations WHERE entity_id = ?');
        const insertObservation = this.db.prepare('INSERT INTO observations (entity_id, observation_type, content, timestamp, source) VALUES (?, ?, ?, ?, ?)');
        const results = [];
        const transaction = this.db.transaction((observationsToAdd) => {
            for (const obs of observationsToAdd) {
                // Resolve entity by ID or name/type
                const entity = this.resolveEntity({
                    id: obs.entityId,
                    name: obs.entityName,
                    entityType: obs.entityType
                });
                if (!entity) {
                    const identifier = obs.entityId ? `id '${obs.entityId}'` : `name '${obs.entityName}' with type '${obs.entityType || ''}'`;
                    throw new Error(`Entity with ${identifier} not found`);
                }
                const existingObs = getExistingObservations.all(entity.id);
                const existingSet = new Set(existingObs.map(o => `${o.observation_type}|${o.source}`));
                const addedObservations = [];
                for (const observation of obs.contents) {
                    const obsKey = `${observation.observationType || ''}|${observation.source || ''}`;
                    if (!existingSet.has(obsKey)) {
                        const timestamp = observation.timestamp || new Date().toISOString();
                        const obsResult = insertObservation.run(entity.id, observation.observationType || '', observation.text, timestamp, observation.source || '');
                        addedObservations.push({
                            id: String(obsResult.lastInsertRowid),
                            text: observation.text,
                            ...(observation.observationType && { observationType: observation.observationType }),
                            timestamp,
                            ...(observation.source && { source: observation.source }),
                        });
                        existingSet.add(obsKey);
                    }
                }
                results.push({
                    entityId: String(entity.id),
                    entityName: entity.name,
                    entityType: entity.entityType,
                    addedObservations
                });
            }
        });
        transaction(observations);
        return results;
    }
    async deleteEntities(entities) {
        const deleteEntityById = this.db.prepare('DELETE FROM entities WHERE id = ?');
        const deleteEntityByName = this.db.prepare('DELETE FROM entities WHERE name = ? AND entity_type = ?');
        const transaction = this.db.transaction((entitiesToDelete) => {
            for (const entity of entitiesToDelete) {
                if (entity.id) {
                    deleteEntityById.run(entity.id);
                }
                else if (entity.name !== undefined) {
                    deleteEntityByName.run(entity.name, entity.entityType || '');
                }
            }
        });
        transaction(entities);
    }
    async deleteObservations(deletions) {
        const deleteObservationById = this.db.prepare('DELETE FROM observations WHERE id = ?');
        const deleteObservationByKey = this.db.prepare('DELETE FROM observations WHERE entity_id = ? AND observation_type = ? AND source = ?');
        const transaction = this.db.transaction((deletionsToProcess) => {
            for (const deletion of deletionsToProcess) {
                if (deletion.id) {
                    // Delete by observation ID
                    deleteObservationById.run(deletion.id);
                }
                else {
                    // Resolve entity
                    const entity = this.resolveEntity({
                        id: deletion.entityId,
                        name: deletion.entityName,
                        entityType: deletion.entityType
                    });
                    if (entity) {
                        deleteObservationByKey.run(entity.id, deletion.observationType || '', deletion.source || '');
                    }
                }
            }
        });
        transaction(deletions);
    }
    async deleteRelations(relations) {
        const deleteRelationById = this.db.prepare('DELETE FROM relations WHERE id = ?');
        const deleteRelationByIds = this.db.prepare('DELETE FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?');
        const transaction = this.db.transaction((relationsToDelete) => {
            for (const relation of relationsToDelete) {
                if (relation.id) {
                    deleteRelationById.run(relation.id);
                }
                else {
                    // Resolve entity IDs - prefer direct IDs over name resolution
                    let fromId = relation.fromId;
                    let toId = relation.toId;
                    // Resolve from entity by name/type if not provided by ID
                    if (fromId === undefined && relation.fromName !== undefined) {
                        const fromEntity = this.resolveEntity({
                            name: relation.fromName,
                            type: relation.fromType ?? ''
                        });
                        if (!fromEntity) {
                            throw new Error(`Source entity not found: ${relation.fromName} (${relation.fromType ?? ''})`);
                        }
                        fromId = String(fromEntity.id);
                    }
                    // Resolve to entity by name/type if not provided by ID
                    if (toId === undefined && relation.toName !== undefined) {
                        const toEntity = this.resolveEntity({
                            name: relation.toName,
                            type: relation.toType ?? ''
                        });
                        if (!toEntity) {
                            throw new Error(`Target entity not found: ${relation.toName} (${relation.toType ?? ''})`);
                        }
                        toId = String(toEntity.id);
                    }
                    if (fromId !== undefined && toId !== undefined && relation.relationType !== undefined) {
                        deleteRelationByIds.run(fromId, toId, relation.relationType);
                    }
                }
            }
        });
        transaction(relations);
    }
    async searchNodes(query) {
        const entities = [];
        const relations = [];
        // Use FTS5 for full-text search with BM25 ranking
        // The query supports FTS5 syntax: AND, OR, NOT, "phrases", prefix*
        const ftsQuery = this.buildFTSQuery(query);
        // Handle empty query by returning empty results
        if (!ftsQuery) {
            return { entities: [], relations: [] };
        }
        const entityRows = this.db
            .prepare(`SELECT DISTINCT fm.entity_id as id, e.name, e.entity_type,
                MIN(fts_content.rank) as score
         FROM fts_content, fts_map fm, entities e
         WHERE fts_content MATCH ?
           AND fts_content.rowid = fm.fts_rowid
           AND fm.entity_id = e.id
         GROUP BY fm.entity_id
         ORDER BY score`)
            .all(ftsQuery);
        for (const row of entityRows) {
            const observations = this.db
                .prepare('SELECT id, observation_type, content, timestamp, source FROM observations WHERE entity_id = ?')
                .all(row.id);
            entities.push({
                id: String(row.id),
                name: row.name,
                entityType: row.entity_type,
                observations: observations.map(o => ({
                    id: String(o.id),
                    text: o.content,
                    ...(o.observation_type && { observationType: o.observation_type }),
                    ...(o.timestamp && { timestamp: o.timestamp }),
                    ...(o.source && { source: o.source }),
                })),
            });
        }
        if (entities.length > 0) {
            // Get relations involving these entities
            const placeholders = Array(entities.length).fill('?').join(',');
            const entityIds = entities.map(e => e.id);
            const relationRows = this.db
                .prepare(`SELECT id, from_entity_id, to_entity_id, relation_type
           FROM relations
           WHERE from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders})`)
                .all(...entityIds, ...entityIds);
            for (const row of relationRows) {
                const fromEntity = this.getEntityById(row.from_entity_id);
                const toEntity = this.getEntityById(row.to_entity_id);
                relations.push({
                    id: String(row.id),
                    fromId: String(row.from_entity_id),
                    toId: String(row.to_entity_id),
                    relationType: row.relation_type,
                    from: fromEntity?.name,
                    fromType: fromEntity?.entityType,
                    to: toEntity?.name,
                    toType: toEntity?.entityType,
                });
            }
        }
        return { entities, relations };
    }
    buildFTSQuery(query) {
        // Check if query already contains FTS5 operators
        const ftsOperators = /\b(AND|OR|NOT|NEAR)\b|[*"()]/;
        if (ftsOperators.test(query)) {
            // Query contains FTS5 syntax, use as-is
            return query;
        }
        // Convert simple query to FTS5 format
        // Split into terms and join with AND for all-terms matching
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        if (terms.length === 0) {
            return ''; // Empty query returns no results
        }
        // Escape special characters and add prefix matching for each term
        const escapedTerms = terms.map(term => {
            // Escape quotes
            const escaped = term.replace(/"/g, '""');
            // Add prefix matching with * for partial matches
            return `"${escaped}"*`;
        });
        return escapedTerms.join(' AND ');
    }
    async openNodes(entityRefs) {
        if (entityRefs.length === 0) {
            return { entities: [], relations: [] };
        }
        const entities = [];
        const resolvedEntities = [];
        // Resolve each entity reference (by ID or name/type)
        for (const ref of entityRefs) {
            const entity = this.resolveEntity(ref);
            if (entity) {
                resolvedEntities.push(entity);
            }
        }
        // Fetch full entity data with observations
        for (const entity of resolvedEntities) {
            const observations = this.db
                .prepare('SELECT id, observation_type, content, timestamp, source FROM observations WHERE entity_id = ?')
                .all(entity.id);
            entities.push({
                id: String(entity.id),
                name: entity.name,
                entityType: entity.entityType,
                observations: observations.map(o => ({
                    id: String(o.id),
                    text: o.content,
                    ...(o.observation_type && { observationType: o.observation_type }),
                    ...(o.timestamp && { timestamp: o.timestamp }),
                    ...(o.source && { source: o.source }),
                })),
            });
        }
        const entityIdSet = new Set(entities.map(e => e.id));
        const relations = [];
        if (entities.length > 0) {
            // Get all relations between the requested entities
            const allRelationRows = this.db
                .prepare('SELECT id, from_entity_id, to_entity_id, relation_type FROM relations')
                .all();
            for (const row of allRelationRows) {
                if (entityIdSet.has(String(row.from_entity_id)) && entityIdSet.has(String(row.to_entity_id))) {
                    const fromEntity = this.getEntityById(row.from_entity_id);
                    const toEntity = this.getEntityById(row.to_entity_id);
                    relations.push({
                        id: String(row.id),
                        fromId: String(row.from_entity_id),
                        toId: String(row.to_entity_id),
                        relationType: row.relation_type,
                        from: fromEntity?.name,
                        fromType: fromEntity?.entityType,
                        to: toEntity?.name,
                        toType: toEntity?.entityType,
                    });
                }
            }
        }
        return { entities, relations };
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=SQLiteStorage.js.map