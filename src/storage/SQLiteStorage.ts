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
import type { Entity, Relation, KnowledgeGraph, StorageAdapter, Observation } from '../types/graph.js';

const CURRENT_SCHEMA_VERSION = 2;

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
        name TEXT UNIQUE NOT NULL,
        entity_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
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
        to_entity TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        UNIQUE(from_entity, to_entity, relation_type),
        FOREIGN KEY (from_entity) REFERENCES entities(name) ON DELETE CASCADE,
        FOREIGN KEY (to_entity) REFERENCES entities(name) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
      CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
      CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity);
      CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity);
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
      .prepare('SELECT from_entity, to_entity, relation_type FROM relations')
      .all() as Array<{ from_entity: string; to_entity: string; relation_type: string }>;

    for (const row of relationRows) {
      relations.push({
        from: row.from_entity,
        to: row.to_entity,
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
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ?');

    const newEntities: Entity[] = [];

    const transaction = this.db.transaction((entitiesToCreate: Entity[]) => {
      for (const entity of entitiesToCreate) {
        const result = insertEntity.run(entity.name, entity.entityType);
        if (result.changes > 0) {
          const entityId = (getEntityId.get(entity.name) as { id: number }).id;
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
      'INSERT OR IGNORE INTO relations (from_entity, to_entity, relation_type) VALUES (?, ?, ?)'
    );

    const newRelations: Relation[] = [];

    const transaction = this.db.transaction((relationsToCreate: Relation[]) => {
      for (const relation of relationsToCreate) {
        const result = insertRelation.run(relation.from, relation.to, relation.relationType);
        if (result.changes > 0) {
          newRelations.push(relation);
        }
      }
    });

    transaction(relations);
    return newRelations;
  }

  async addObservations(
    observations: { entityName: string; contents: Observation[] }[]
  ): Promise<{ entityName: string; addedObservations: Observation[] }[]> {
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ?');
    const getExistingObservations = this.db.prepare(
      'SELECT content FROM observations WHERE entity_id = ?'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, content, timestamp, source) VALUES (?, ?, ?, ?)'
    );

    const results: { entityName: string; addedObservations: Observation[] }[] = [];

    const transaction = this.db.transaction((observationsToAdd: typeof observations) => {
      for (const obs of observationsToAdd) {
        const entityRow = getEntityId.get(obs.entityName) as { id: number } | undefined;
        if (!entityRow) {
          throw new Error(`Entity with name ${obs.entityName} not found`);
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

        results.push({ entityName: obs.entityName, addedObservations });
      }
    });

    transaction(observations);
    return results;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    const deleteEntity = this.db.prepare('DELETE FROM entities WHERE name = ?');
    const deleteRelationsFrom = this.db.prepare('DELETE FROM relations WHERE from_entity = ? OR to_entity = ?');

    const transaction = this.db.transaction((names: string[]) => {
      for (const name of names) {
        deleteRelationsFrom.run(name, name);
        deleteEntity.run(name);
      }
    });

    transaction(entityNames);
  }

  async deleteObservations(deletions: { entityName: string; observations: Observation[] }[]): Promise<void> {
    const getEntityId = this.db.prepare('SELECT id FROM entities WHERE name = ?');
    const deleteObservation = this.db.prepare(
      'DELETE FROM observations WHERE entity_id = ? AND content = ?'
    );

    const transaction = this.db.transaction((deletionsToProcess: typeof deletions) => {
      for (const deletion of deletionsToProcess) {
        const entityRow = getEntityId.get(deletion.entityName) as { id: number } | undefined;
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
      'DELETE FROM relations WHERE from_entity = ? AND to_entity = ? AND relation_type = ?'
    );

    const transaction = this.db.transaction((relationsToDelete: Relation[]) => {
      for (const relation of relationsToDelete) {
        deleteRelation.run(relation.from, relation.to, relation.relationType);
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

    const entityNames = new Set(entities.map(e => e.name));

    if (entityNames.size > 0) {
      const namePlaceholders = Array.from(entityNames).map(() => '?').join(',');
      const nameArray = Array.from(entityNames);

      const relationRows = this.db
        .prepare(
          `SELECT from_entity, to_entity, relation_type
           FROM relations
           WHERE from_entity IN (${namePlaceholders})
              OR to_entity IN (${namePlaceholders})`
        )
        .all(...nameArray, ...nameArray) as Array<{ from_entity: string; to_entity: string; relation_type: string }>;

      for (const row of relationRows) {
        relations.push({
          from: row.from_entity,
          to: row.to_entity,
          relationType: row.relation_type,
        });
      }
    }

    return { entities, relations };
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    if (names.length === 0) {
      return { entities: [], relations: [] };
    }

    const placeholders = names.map(() => '?').join(',');
    const entities: Entity[] = [];

    const entityRows = this.db
      .prepare(`SELECT id, name, entity_type FROM entities WHERE name IN (${placeholders})`)
      .all(...names) as Array<{ id: number; name: string; entity_type: string }>;

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

    const entityNames = new Set(entities.map(e => e.name));
    const relations: Relation[] = [];

    if (entityNames.size > 0) {
      const relationRows = this.db
        .prepare(
          `SELECT from_entity, to_entity, relation_type
           FROM relations
           WHERE from_entity IN (${placeholders}) AND to_entity IN (${placeholders})`
        )
        .all(...names, ...names) as Array<{
        from_entity: string;
        to_entity: string;
        relation_type: string;
      }>;

      for (const row of relationRows) {
        if (entityNames.has(row.from_entity) && entityNames.has(row.to_entity)) {
          relations.push({
            from: row.from_entity,
            to: row.to_entity,
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
