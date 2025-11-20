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
import type { Entity, Relation, KnowledgeGraph, StorageAdapter, Observation, EntityReference } from '../types/graph.js';

const CURRENT_SCHEMA_VERSION = 3;

export class SQLiteStorage implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER DEFAULT (unixepoch())
      );

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
        content TEXT NOT NULL,
        timestamp TEXT,
        source TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity TEXT NOT NULL,
        from_type TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        to_type TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(from_entity, from_type, to_entity, to_type, relation_type)
      );

      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_entities_name_type ON entities(name, entity_type);
      CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity, from_type);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity, to_type);
      CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
    `);

    this.ensureSchemaVersion();
  }

  private ensureSchemaVersion(): void {
    const versionRow = this.db
      .prepare('SELECT version FROM schema_version LIMIT 1')
      .get() as { version: number } | undefined;

    if (!versionRow) {
      this.db
        .prepare('INSERT INTO schema_version (version) VALUES (?)')
        .run(CURRENT_SCHEMA_VERSION);
    } else if (versionRow.version < CURRENT_SCHEMA_VERSION) {
      this.migrateSchema(versionRow.version, CURRENT_SCHEMA_VERSION);
    } else if (versionRow.version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version mismatch. Expected ${CURRENT_SCHEMA_VERSION}, found ${versionRow.version}. Database is newer than this version of the software.`
      );
    }
  }

  private migrateSchema(fromVersion: number, toVersion: number): void {
    console.log(`Migrating database schema from version ${fromVersion} to ${toVersion}`);

    if (fromVersion === 1 && toVersion >= 2) {
      // Add timestamp and source columns to observations table
      this.db.exec(`
        ALTER TABLE observations ADD COLUMN timestamp TEXT;
        ALTER TABLE observations ADD COLUMN source TEXT;
      `);
      this.db.prepare('UPDATE schema_version SET version = ?').run(2);
      console.log('Migration to version 2 complete: Added timestamp and source columns to observations');
      fromVersion = 2;
    }

    if (fromVersion === 2 && toVersion >= 3) {
      // Migrate to composite unique key (name, entity_type) for entities
      // and add from_type/to_type columns to relations
      this.db.exec(`
        -- Create new entities table with composite unique key
        CREATE TABLE entities_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          UNIQUE(name, entity_type)
        );

        -- Copy data from old entities table
        INSERT INTO entities_new (id, name, entity_type, created_at, updated_at)
        SELECT id, name, entity_type, created_at, updated_at FROM entities;

        -- Drop old table and rename new one
        DROP TABLE entities;
        ALTER TABLE entities_new RENAME TO entities;

        -- Create new relations table with from_type and to_type
        CREATE TABLE relations_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_entity TEXT NOT NULL,
          from_type TEXT NOT NULL,
          to_entity TEXT NOT NULL,
          to_type TEXT NOT NULL,
          relation_type TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch()),
          UNIQUE(from_entity, from_type, to_entity, to_type, relation_type)
        );

        -- Migrate relations data, looking up entity types
        INSERT INTO relations_new (from_entity, from_type, to_entity, to_type, relation_type, created_at)
        SELECT
          r.from_entity,
          COALESCE(e1.entity_type, 'unknown'),
          r.to_entity,
          COALESCE(e2.entity_type, 'unknown'),
          r.relation_type,
          r.created_at
        FROM relations r
        LEFT JOIN entities e1 ON r.from_entity = e1.name
        LEFT JOIN entities e2 ON r.to_entity = e2.name;

        -- Drop old relations table and rename new one
        DROP TABLE relations;
        ALTER TABLE relations_new RENAME TO relations;

        -- Recreate indexes
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
        CREATE INDEX IF NOT EXISTS idx_entities_name_type ON entities(name, entity_type);
        CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity, from_type);
        CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity, to_type);
        CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);
      `);
      this.db.prepare('UPDATE schema_version SET version = ?').run(3);
      console.log('Migration to version 3 complete: Added composite unique key for entities and entity types for relations');
    }
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    const entities: Entity[] = [];
    const relations: Relation[] = [];

    const entityRows = this.db.prepare('SELECT id, name, entity_type FROM entities').all() as Array<{
      id: number;
      name: string;
      entity_type: string;
    }>;

    for (const row of entityRows) {
      const observations = this.db
        .prepare('SELECT content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        name: row.name,
        entityType: row.entity_type,
        observations: observations.map(o => ({
          text: o.content,
          ...(o.timestamp && { timestamp: o.timestamp }),
          ...(o.source && { source: o.source }),
        })),
      });
    }

    const relationRows = this.db
      .prepare('SELECT from_entity, from_type, to_entity, to_type, relation_type FROM relations')
      .all() as Array<{ from_entity: string; from_type: string; to_entity: string; to_type: string; relation_type: string }>;

    for (const row of relationRows) {
      relations.push({
        from: row.from_entity,
        fromType: row.from_type,
        to: row.to_entity,
        toType: row.to_type,
        relationType: row.relation_type,
      });
    }

    return { entities, relations };
  }

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const insertEntity = this.db.prepare(
      'INSERT OR IGNORE INTO entities (name, entity_type) VALUES (?, ?)'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, content, timestamp, source) VALUES (?, ?, ?, ?)'
    );
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ? AND entity_type = ?');

    const newEntities: Entity[] = [];

    const transaction = this.db.transaction((entitiesToCreate: Entity[]) => {
      for (const entity of entitiesToCreate) {
        const result = insertEntity.run(entity.name, entity.entityType);
        if (result.changes > 0) {
          const entityId = (getEntityId.get(entity.name, entity.entityType) as { id: number }).id;
          for (const observation of entity.observations) {
            const timestamp = observation.timestamp || new Date().toISOString();
            insertObservation.run(entityId, observation.text, timestamp, observation.source || null);
          }
          newEntities.push(entity);
        }
      }
    });

    transaction(entities);
    return newEntities;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const insertRelation = this.db.prepare(
      'INSERT OR IGNORE INTO relations (from_entity, from_type, to_entity, to_type, relation_type) VALUES (?, ?, ?, ?, ?)'
    );
    const checkEntityExists = this.db.prepare(
      'SELECT 1 FROM entities WHERE name = ? AND entity_type = ?'
    );

    const newRelations: Relation[] = [];

    const transaction = this.db.transaction((relationsToCreate: Relation[]) => {
      for (const relation of relationsToCreate) {
        // Verify both entities exist
        const fromExists = checkEntityExists.get(relation.from, relation.fromType);
        if (!fromExists) {
          throw new Error(`Entity '${relation.from}' with type '${relation.fromType}' not found`);
        }

        const toExists = checkEntityExists.get(relation.to, relation.toType);
        if (!toExists) {
          throw new Error(`Entity '${relation.to}' with type '${relation.toType}' not found`);
        }

        const result = insertRelation.run(
          relation.from,
          relation.fromType,
          relation.to,
          relation.toType,
          relation.relationType
        );
        if (result.changes > 0) {
          newRelations.push(relation);
        }
      }
    });

    transaction(relations);
    return newRelations;
  }

  async addObservations(
    observations: { entityName: string; entityType: string; contents: Observation[] }[]
  ): Promise<{ entityName: string; entityType: string; addedObservations: Observation[] }[]> {
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ? AND entity_type = ?');
    const getExistingObservations = this.db.prepare(
      'SELECT content FROM observations WHERE entity_id = ?'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, content, timestamp, source) VALUES (?, ?, ?, ?)'
    );

    const results: { entityName: string; entityType: string; addedObservations: Observation[] }[] = [];

    const transaction = this.db.transaction((observationsToAdd: typeof observations) => {
      for (const obs of observationsToAdd) {
        const entityRow = getEntityId.get(obs.entityName, obs.entityType) as { id: number } | undefined;
        if (!entityRow) {
          throw new Error(`Entity with name ${obs.entityName} and type ${obs.entityType} not found`);
        }

        const existingObs = getExistingObservations.all(entityRow.id) as Array<{ content: string }>;
        const existingSet = new Set(existingObs.map(o => o.content));

        const addedObservations: Observation[] = [];
        for (const observation of obs.contents) {
          if (!existingSet.has(observation.text)) {
            const timestamp = observation.timestamp || new Date().toISOString();
            insertObservation.run(entityRow.id, observation.text, timestamp, observation.source || null);
            addedObservations.push({
              text: observation.text,
              timestamp,
              ...(observation.source && { source: observation.source }),
            });
          }
        }

        results.push({ entityName: obs.entityName, entityType: obs.entityType, addedObservations });
      }
    });

    transaction(observations);
    return results;
  }

  async deleteEntities(entities: EntityReference[]): Promise<void> {
    const deleteEntity = this.db.prepare('DELETE FROM entities WHERE name = ? AND entity_type = ?');
    const deleteRelations = this.db.prepare(
      'DELETE FROM relations WHERE (from_entity = ? AND from_type = ?) OR (to_entity = ? AND to_type = ?)'
    );

    const transaction = this.db.transaction((entitiesToDelete: EntityReference[]) => {
      for (const entity of entitiesToDelete) {
        deleteRelations.run(entity.name, entity.entityType, entity.name, entity.entityType);
        deleteEntity.run(entity.name, entity.entityType);
      }
    });

    transaction(entities);
  }

  async deleteObservations(deletions: { entityName: string; entityType: string; observations: Observation[] }[]): Promise<void> {
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ? AND entity_type = ?');
    const deleteObservation = this.db.prepare(
      'DELETE FROM observations WHERE entity_id = ? AND content = ?'
    );

    const transaction = this.db.transaction((deletionsToProcess: typeof deletions) => {
      for (const deletion of deletionsToProcess) {
        const entityRow = getEntityId.get(deletion.entityName, deletion.entityType) as { id: number } | undefined;
        if (entityRow) {
          for (const observation of deletion.observations) {
            deleteObservation.run(entityRow.id, observation.text);
          }
        }
      }
    });

    transaction(deletions);
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    const deleteRelation = this.db.prepare(
      'DELETE FROM relations WHERE from_entity = ? AND from_type = ? AND to_entity = ? AND to_type = ? AND relation_type = ?'
    );

    const transaction = this.db.transaction((relationsToDelete: Relation[]) => {
      for (const relation of relationsToDelete) {
        deleteRelation.run(relation.from, relation.fromType, relation.to, relation.toType, relation.relationType);
      }
    });

    transaction(relations);
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const searchPattern = `%${query.toLowerCase()}%`;

    const entityIds = new Set<number>();
    const entities: Entity[] = [];
    const relations: Relation[] = [];

    const entityRows = this.db
      .prepare(
        `SELECT DISTINCT e.id, e.name, e.entity_type
         FROM entities e
         LEFT JOIN observations o ON e.id = o.entity_id
         WHERE LOWER(e.name) LIKE ?
            OR LOWER(e.entity_type) LIKE ?
            OR LOWER(o.content) LIKE ?`
      )
      .all(searchPattern, searchPattern, searchPattern) as Array<{
      id: number;
      name: string;
      entity_type: string;
    }>;

    for (const row of entityRows) {
      entityIds.add(row.id);
      const observations = this.db
        .prepare('SELECT content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        name: row.name,
        entityType: row.entity_type,
        observations: observations.map(o => ({
          text: o.content,
          ...(o.timestamp && { timestamp: o.timestamp }),
          ...(o.source && { source: o.source }),
        })),
      });
    }

    // Build set of (name, type) pairs for matching relations
    const entityKeys = new Set(entities.map(e => `${e.name}:${e.entityType}`));

    if (entities.length > 0) {
      // Build conditions for matching entities
      const conditions: string[] = [];
      const params: string[] = [];

      for (const entity of entities) {
        conditions.push('(from_entity = ? AND from_type = ?)');
        conditions.push('(to_entity = ? AND to_type = ?)');
        params.push(entity.name, entity.entityType, entity.name, entity.entityType);
      }

      const relationRows = this.db
        .prepare(
          `SELECT from_entity, from_type, to_entity, to_type, relation_type
           FROM relations
           WHERE ${conditions.join(' OR ')}`
        )
        .all(...params) as Array<{ from_entity: string; from_type: string; to_entity: string; to_type: string; relation_type: string }>;

      for (const row of relationRows) {
        relations.push({
          from: row.from_entity,
          fromType: row.from_type,
          to: row.to_entity,
          toType: row.to_type,
          relationType: row.relation_type,
        });
      }
    }

    return { entities, relations };
  }

  async openNodes(entityRefs: EntityReference[]): Promise<KnowledgeGraph> {
    if (entityRefs.length === 0) {
      return { entities: [], relations: [] };
    }

    const entities: Entity[] = [];

    // Build conditions for matching entities by (name, type) pairs
    const conditions = entityRefs.map(() => '(name = ? AND entity_type = ?)').join(' OR ');
    const params: string[] = [];
    for (const ref of entityRefs) {
      params.push(ref.name, ref.entityType);
    }

    const entityRows = this.db
      .prepare(`SELECT id, name, entity_type FROM entities WHERE ${conditions}`)
      .all(...params) as Array<{ id: number; name: string; entity_type: string }>;

    for (const row of entityRows) {
      const observations = this.db
        .prepare('SELECT content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        name: row.name,
        entityType: row.entity_type,
        observations: observations.map(o => ({
          text: o.content,
          ...(o.timestamp && { timestamp: o.timestamp }),
          ...(o.source && { source: o.source }),
        })),
      });
    }

    const entityKeys = new Set(entities.map(e => `${e.name}:${e.entityType}`));
    const relations: Relation[] = [];

    if (entities.length > 0) {
      // Build conditions for matching relations
      const relationConditions: string[] = [];
      const relationParams: string[] = [];

      for (const entity of entities) {
        relationConditions.push('(from_entity = ? AND from_type = ? AND to_entity = ? AND to_type = ?)');
      }

      // Get all relations between the requested entities
      const allRelationRows = this.db
        .prepare(
          `SELECT from_entity, from_type, to_entity, to_type, relation_type
           FROM relations`
        )
        .all() as Array<{
        from_entity: string;
        from_type: string;
        to_entity: string;
        to_type: string;
        relation_type: string;
      }>;

      for (const row of allRelationRows) {
        const fromKey = `${row.from_entity}:${row.from_type}`;
        const toKey = `${row.to_entity}:${row.to_type}`;
        if (entityKeys.has(fromKey) && entityKeys.has(toKey)) {
          relations.push({
            from: row.from_entity,
            fromType: row.from_type,
            to: row.to_entity,
            toType: row.to_type,
            relationType: row.relation_type,
          });
        }
      }
    }

    return { entities, relations };
  }

  close(): void {
    this.db.close();
  }
}
