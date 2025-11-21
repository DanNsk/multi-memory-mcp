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
import type {
  Entity,
  Relation,
  KnowledgeGraph,
  StorageAdapter,
  Observation,
  EntityReference,
  RelationInput,
  RelationIdentifier,
  ObservationIdentifier,
  ObservationResult
} from '../types/graph.js';

// Current schema version - increment when making schema changes
const SCHEMA_VERSION = 3;

export class SQLiteStorage implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
    this.upgradeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        properties TEXT,
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
        properties TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
        UNIQUE(entity_id, observation_type, source)
      );

      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity_id INTEGER NOT NULL,
        to_entity_id INTEGER NOT NULL,
        relation_type TEXT NOT NULL,
        properties TEXT,
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

  private getSchemaVersion(): number {
    const row = this.db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  private setSchemaVersion(version: number): void {
    this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(version);
  }

  private upgradeSchema(): void {
    const currentVersion = this.getSchemaVersion();

    if (currentVersion < 2) {
      this.upgradeToVersion2();
    }

    if (currentVersion < 3) {
      this.upgradeToVersion3();
    }

    if (currentVersion < SCHEMA_VERSION) {
      this.setSchemaVersion(SCHEMA_VERSION);
    }
  }

  private upgradeToVersion3(): void {
    // Add properties column to entities, observations, and relations tables
    // Check if columns exist before adding (for safety)
    const tableInfo = (tableName: string) => {
      return this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    };

    const entityColumns = tableInfo('entities').map(c => c.name);
    if (!entityColumns.includes('properties')) {
      this.db.exec('ALTER TABLE entities ADD COLUMN properties TEXT');
    }

    const observationColumns = tableInfo('observations').map(c => c.name);
    if (!observationColumns.includes('properties')) {
      this.db.exec('ALTER TABLE observations ADD COLUMN properties TEXT');
    }

    const relationColumns = tableInfo('relations').map(c => c.name);
    if (!relationColumns.includes('properties')) {
      this.db.exec('ALTER TABLE relations ADD COLUMN properties TEXT');
    }

    // Update FTS triggers to include properties in search
    // Drop existing triggers and recreate with properties
    this.db.exec(`
      DROP TRIGGER IF EXISTS fts_entity_insert;
      DROP TRIGGER IF EXISTS fts_entity_update;
      DROP TRIGGER IF EXISTS fts_observation_insert;
      DROP TRIGGER IF EXISTS fts_observation_update;
    `);

    // Recreate triggers with properties included
    this.db.exec(`
      -- Trigger: After entity insert - create FTS entry for entity with properties
      CREATE TRIGGER IF NOT EXISTS fts_entity_insert AFTER INSERT ON entities BEGIN
        INSERT INTO fts_content (entity_name, entity_type, observation_content)
        VALUES (NEW.name, NEW.entity_type, COALESCE(NEW.properties, ''));
        INSERT INTO fts_map (fts_rowid, entity_id)
        VALUES (last_insert_rowid(), NEW.id);
      END;

      -- Trigger: After entity update - update FTS entries with properties
      CREATE TRIGGER IF NOT EXISTS fts_entity_update AFTER UPDATE ON entities BEGIN
        -- Update entity's own FTS entry
        UPDATE fts_content SET
          entity_name = NEW.name,
          entity_type = NEW.entity_type,
          observation_content = COALESCE(NEW.properties, '')
        WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE entity_id = NEW.id AND observation_id IS NULL);
        -- Update observation entries' entity name/type only
        UPDATE fts_content SET entity_name = NEW.name, entity_type = NEW.entity_type
        WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE entity_id = NEW.id AND observation_id IS NOT NULL);
      END;

      -- Trigger: After observation insert - create FTS entry for observation with properties
      CREATE TRIGGER IF NOT EXISTS fts_observation_insert AFTER INSERT ON observations BEGIN
        INSERT INTO fts_content (entity_name, entity_type, observation_content)
        SELECT e.name, e.entity_type, NEW.content || ' ' || COALESCE(NEW.properties, '')
        FROM entities e WHERE e.id = NEW.entity_id;
        INSERT INTO fts_map (fts_rowid, entity_id, observation_id)
        VALUES (last_insert_rowid(), NEW.entity_id, NEW.id);
      END;

      -- Trigger: After observation update - update FTS entry with properties
      CREATE TRIGGER IF NOT EXISTS fts_observation_update AFTER UPDATE ON observations BEGIN
        UPDATE fts_content SET observation_content = NEW.content || ' ' || COALESCE(NEW.properties, '')
        WHERE rowid IN (SELECT fts_rowid FROM fts_map WHERE observation_id = NEW.id);
      END;
    `);

    // Rebuild FTS index to include properties
    this.rebuildFTSIndex();
  }

  private upgradeToVersion2(): void {
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

  private rebuildFTSIndex(): void {
    // Clear existing FTS data
    this.db.exec('DELETE FROM fts_content');
    this.db.exec('DELETE FROM fts_map');

    // Index all entities (one entry per entity for entity-level search)
    const entities = this.db.prepare('SELECT id, name, entity_type, properties FROM entities').all() as Array<{
      id: number;
      name: string;
      entity_type: string;
      properties: string | null;
    }>;

    const insertFts = this.db.prepare(
      'INSERT INTO fts_content (entity_name, entity_type, observation_content) VALUES (?, ?, ?)'
    );
    const insertMap = this.db.prepare(
      'INSERT INTO fts_map (fts_rowid, entity_id, observation_id) VALUES (?, ?, ?)'
    );

    const transaction = this.db.transaction(() => {
      for (const entity of entities) {
        // Insert entity entry with properties
        const result = insertFts.run(entity.name, entity.entity_type, entity.properties || '');
        insertMap.run(result.lastInsertRowid, entity.id, null);
      }

      // Index all observations
      const observations = this.db.prepare(`
        SELECT o.id as obs_id, o.content, o.properties as obs_properties, e.id as entity_id, e.name, e.entity_type
        FROM observations o
        JOIN entities e ON o.entity_id = e.id
      `).all() as Array<{
        obs_id: number;
        content: string;
        obs_properties: string | null;
        entity_id: number;
        name: string;
        entity_type: string;
      }>;

      for (const obs of observations) {
        const obsContent = obs.content + (obs.obs_properties ? ' ' + obs.obs_properties : '');
        const result = insertFts.run(obs.name, obs.entity_type, obsContent);
        insertMap.run(result.lastInsertRowid, obs.entity_id, obs.obs_id);
      }
    });

    transaction();
  }

  // Helper method to resolve entity by ID or name/type
  private resolveEntity(ref: { id?: string; name?: string; type?: string } | { id?: string; name?: string; entityType?: string }): { id: number; name: string; entityType: string } | null {
    if (ref.id) {
      const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE id = ?').get(ref.id) as { id: number; name: string; entity_type: string } | undefined;
      if (row) {
        return { id: row.id, name: row.name, entityType: row.entity_type };
      }
      return null;
    }

    const name = ref.name;
    const entityType = 'type' in ref ? ref.type : ('entityType' in ref ? ref.entityType : '');

    if (name !== undefined) {
      const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE name = ? AND entity_type = ?').get(name, entityType || '') as { id: number; name: string; entity_type: string } | undefined;
      if (row) {
        return { id: row.id, name: row.name, entityType: row.entity_type };
      }
    }

    return null;
  }

  // Helper to get entity by ID
  private getEntityById(id: number): { id: number; name: string; entityType: string } | null {
    const row = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE id = ?').get(id) as { id: number; name: string; entity_type: string } | undefined;
    if (row) {
      return { id: row.id, name: row.name, entityType: row.entity_type };
    }
    return null;
  }

  async loadGraph(): Promise<KnowledgeGraph> {
    const entities: Entity[] = [];
    const relations: Relation[] = [];

    const entityRows = this.db.prepare('SELECT id, name, entity_type, properties FROM entities').all() as Array<{
      id: number;
      name: string;
      entity_type: string;
      properties: string | null;
    }>;

    for (const row of entityRows) {
      const observations = this.db
        .prepare('SELECT id, observation_type, content, timestamp, source, properties FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ id: number; observation_type: string; content: string; timestamp: string | null; source: string; properties: string | null }>;

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
          ...(o.properties && { properties: JSON.parse(o.properties) }),
        })),
        ...(row.properties && { properties: JSON.parse(row.properties) }),
      });
    }

    const relationRows = this.db
      .prepare('SELECT id, from_entity_id, to_entity_id, relation_type, properties FROM relations')
      .all() as Array<{ id: number; from_entity_id: number; to_entity_id: number; relation_type: string; properties: string | null }>;

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
        ...(row.properties && { properties: JSON.parse(row.properties) }),
      });
    }

    return { entities, relations };
  }

  async createEntities(entities: Entity[], override: boolean = false): Promise<Entity[]> {
    const insertEntity = this.db.prepare(
      'INSERT OR IGNORE INTO entities (name, entity_type, properties) VALUES (?, ?, ?)'
    );
    const updateEntity = this.db.prepare(
      'UPDATE entities SET properties = ?, updated_at = unixepoch() WHERE name = ? AND entity_type = ?'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, observation_type, content, timestamp, source, properties) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const updateObservation = this.db.prepare(
      'UPDATE observations SET content = ?, timestamp = ?, properties = ? WHERE entity_id = ? AND observation_type = ? AND source = ?'
    );
    const getEntity = this.db.prepare('SELECT id, name, entity_type, properties FROM entities WHERE name = ? AND entity_type = ?');
    const deleteEntityObservations = this.db.prepare('DELETE FROM observations WHERE entity_id = ?');

    const newEntities: Entity[] = [];

    const transaction = this.db.transaction((entitiesToCreate: Entity[]) => {
      for (const entity of entitiesToCreate) {
        const propertiesJson = entity.properties ? JSON.stringify(entity.properties) : null;
        const result = insertEntity.run(entity.name, entity.entityType, propertiesJson);

        let entityRow: { id: number; name: string; entity_type: string; properties: string | null };
        let isNewEntity = result.changes > 0;

        if (!isNewEntity) {
          // Entity already exists
          entityRow = getEntity.get(entity.name, entity.entityType) as typeof entityRow;

          if (override) {
            // Override: update entity properties and replace all observations
            updateEntity.run(propertiesJson, entity.name, entity.entityType);
            deleteEntityObservations.run(entityRow.id);
            isNewEntity = true; // Treat as new so we add observations
          }
        } else {
          entityRow = getEntity.get(entity.name, entity.entityType) as typeof entityRow;
        }

        if (isNewEntity) {
          const observationsWithIds: Observation[] = [];

          for (const observation of entity.observations) {
            const timestamp = observation.timestamp || new Date().toISOString();
            const obsPropertiesJson = observation.properties ? JSON.stringify(observation.properties) : null;
            const obsResult = insertObservation.run(entityRow.id, observation.observationType || '', observation.text, timestamp, observation.source || '', obsPropertiesJson);
            observationsWithIds.push({
              id: String(obsResult.lastInsertRowid),
              text: observation.text,
              ...(observation.observationType && { observationType: observation.observationType }),
              timestamp,
              ...(observation.source && { source: observation.source }),
              ...(observation.properties && { properties: observation.properties }),
            });
          }

          newEntities.push({
            id: String(entityRow.id),
            name: entity.name,
            entityType: entity.entityType,
            observations: observationsWithIds,
            ...(entity.properties && { properties: entity.properties }),
          });
        }
      }
    });

    transaction(entities);
    return newEntities;
  }

  async createRelations(relations: RelationInput[], override: boolean = false): Promise<Relation[]> {
    const insertRelation = this.db.prepare(
      'INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type, properties) VALUES (?, ?, ?, ?)'
    );
    const updateRelation = this.db.prepare(
      'UPDATE relations SET properties = ? WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?'
    );
    const getRelation = this.db.prepare(
      'SELECT id, properties FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?'
    );

    const newRelations: Relation[] = [];

    const transaction = this.db.transaction((relationsToCreate: RelationInput[]) => {
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

        const propertiesJson = relation.properties ? JSON.stringify(relation.properties) : null;
        const result = insertRelation.run(
          fromEntity.id,
          toEntity.id,
          relation.relationType,
          propertiesJson
        );

        let relationRow: { id: number; properties: string | null };

        if (result.changes > 0) {
          relationRow = getRelation.get(
            fromEntity.id,
            toEntity.id,
            relation.relationType
          ) as typeof relationRow;
        } else if (override) {
          // Relation exists and override is true - update properties
          updateRelation.run(propertiesJson, fromEntity.id, toEntity.id, relation.relationType);
          relationRow = getRelation.get(
            fromEntity.id,
            toEntity.id,
            relation.relationType
          ) as typeof relationRow;
        } else {
          // Relation exists but no override - skip
          continue;
        }

        newRelations.push({
          id: String(relationRow.id),
          fromId: String(fromEntity.id),
          toId: String(toEntity.id),
          relationType: relation.relationType,
          from: fromEntity.name,
          fromType: fromEntity.entityType,
          to: toEntity.name,
          toType: toEntity.entityType,
          ...(relation.properties && { properties: relation.properties }),
        });
      }
    });

    transaction(relations);
    return newRelations;
  }

  async addObservations(
    observations: { entityId?: string; entityName?: string; entityType?: string; contents: Observation[] }[],
    override: boolean = false
  ): Promise<ObservationResult[]> {
    const getExistingObservations = this.db.prepare(
      'SELECT id, observation_type, source FROM observations WHERE entity_id = ?'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, observation_type, content, timestamp, source, properties) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const updateObservation = this.db.prepare(
      'UPDATE observations SET content = ?, timestamp = ?, properties = ? WHERE entity_id = ? AND observation_type = ? AND source = ?'
    );
    const getObservation = this.db.prepare(
      'SELECT id FROM observations WHERE entity_id = ? AND observation_type = ? AND source = ?'
    );

    const results: ObservationResult[] = [];

    const transaction = this.db.transaction((observationsToAdd: typeof observations) => {
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

        const existingObs = getExistingObservations.all(entity.id) as Array<{ id: number; observation_type: string; source: string }>;
        const existingMap = new Map(existingObs.map(o => [`${o.observation_type}|${o.source}`, o.id]));

        const addedObservations: Observation[] = [];
        for (const observation of obs.contents) {
          const obsKey = `${observation.observationType || ''}|${observation.source || ''}`;
          const timestamp = observation.timestamp || new Date().toISOString();
          const propertiesJson = observation.properties ? JSON.stringify(observation.properties) : null;

          if (!existingMap.has(obsKey)) {
            // New observation - insert
            const obsResult = insertObservation.run(entity.id, observation.observationType || '', observation.text, timestamp, observation.source || '', propertiesJson);
            addedObservations.push({
              id: String(obsResult.lastInsertRowid),
              text: observation.text,
              ...(observation.observationType && { observationType: observation.observationType }),
              timestamp,
              ...(observation.source && { source: observation.source }),
              ...(observation.properties && { properties: observation.properties }),
            });
            existingMap.set(obsKey, Number(obsResult.lastInsertRowid));
          } else if (override) {
            // Existing observation with override - update
            updateObservation.run(observation.text, timestamp, propertiesJson, entity.id, observation.observationType || '', observation.source || '');
            const existingId = existingMap.get(obsKey);
            addedObservations.push({
              id: String(existingId),
              text: observation.text,
              ...(observation.observationType && { observationType: observation.observationType }),
              timestamp,
              ...(observation.source && { source: observation.source }),
              ...(observation.properties && { properties: observation.properties }),
            });
          }
          // If exists and no override, skip silently
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

  async deleteEntities(entities: EntityReference[]): Promise<void> {
    const deleteEntityById = this.db.prepare('DELETE FROM entities WHERE id = ?');
    const deleteEntityByName = this.db.prepare('DELETE FROM entities WHERE name = ? AND entity_type = ?');

    const transaction = this.db.transaction((entitiesToDelete: EntityReference[]) => {
      for (const entity of entitiesToDelete) {
        if (entity.id) {
          deleteEntityById.run(entity.id);
        } else if (entity.name !== undefined) {
          deleteEntityByName.run(entity.name, entity.entityType || '');
        }
      }
    });

    transaction(entities);
  }

  async deleteObservations(deletions: ObservationIdentifier[]): Promise<void> {
    const deleteObservationById = this.db.prepare('DELETE FROM observations WHERE id = ?');
    const deleteObservationByKey = this.db.prepare(
      'DELETE FROM observations WHERE entity_id = ? AND observation_type = ? AND source = ?'
    );

    const transaction = this.db.transaction((deletionsToProcess: ObservationIdentifier[]) => {
      for (const deletion of deletionsToProcess) {
        if (deletion.id) {
          // Delete by observation ID
          deleteObservationById.run(deletion.id);
        } else {
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

  async deleteRelations(relations: RelationIdentifier[]): Promise<void> {
    const deleteRelationById = this.db.prepare('DELETE FROM relations WHERE id = ?');
    const deleteRelationByIds = this.db.prepare(
      'DELETE FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?'
    );

    const transaction = this.db.transaction((relationsToDelete: RelationIdentifier[]) => {
      for (const relation of relationsToDelete) {
        if (relation.id) {
          deleteRelationById.run(relation.id);
        } else {
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

  async searchNodes(query: string, limit?: number): Promise<KnowledgeGraph> {
    const entities: Entity[] = [];
    const relations: Relation[] = [];

    // Use FTS5 for full-text search with BM25 ranking
    // The query supports FTS5 syntax: AND, OR, NOT, "phrases", prefix*
    const ftsQuery = this.buildFTSQuery(query);

    // Handle empty query by returning empty results
    if (!ftsQuery) {
      return { entities: [], relations: [] };
    }

    const resultLimit = limit ?? 50;

    const entityRows = this.db
      .prepare(
        `SELECT DISTINCT fm.entity_id as id, e.name, e.entity_type,
                MIN(fts_content.rank) as score
         FROM fts_content, fts_map fm, entities e
         WHERE fts_content MATCH ?
           AND fts_content.rowid = fm.fts_rowid
           AND fm.entity_id = e.id
         GROUP BY fm.entity_id
         ORDER BY score
         LIMIT ?`
      )
      .all(ftsQuery, resultLimit) as Array<{
      id: number;
      name: string;
      entity_type: string;
      score: number;
    }>;

    // Get entity properties for the matched entities
    const entityPropsMap = new Map<number, string | null>();
    if (entityRows.length > 0) {
      const entityIds = entityRows.map(e => e.id);
      const placeholders = Array(entityIds.length).fill('?').join(',');
      const propsRows = this.db
        .prepare(`SELECT id, properties FROM entities WHERE id IN (${placeholders})`)
        .all(...entityIds) as Array<{ id: number; properties: string | null }>;
      for (const row of propsRows) {
        entityPropsMap.set(row.id, row.properties);
      }
    }

    for (const row of entityRows) {
      const observations = this.db
        .prepare('SELECT id, observation_type, content, timestamp, source, properties FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ id: number; observation_type: string; content: string; timestamp: string | null; source: string; properties: string | null }>;

      const entityProps = entityPropsMap.get(row.id);
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
          ...(o.properties && { properties: JSON.parse(o.properties) }),
        })),
        ...(entityProps && { properties: JSON.parse(entityProps) }),
      });
    }

    if (entities.length > 0) {
      // Get relations involving these entities
      const placeholders = Array(entities.length).fill('?').join(',');
      const entityIds = entities.map(e => e.id);

      const relationRows = this.db
        .prepare(
          `SELECT id, from_entity_id, to_entity_id, relation_type, properties
           FROM relations
           WHERE from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders})`
        )
        .all(...entityIds, ...entityIds) as Array<{ id: number; from_entity_id: number; to_entity_id: number; relation_type: string; properties: string | null }>;

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
          ...(row.properties && { properties: JSON.parse(row.properties) }),
        });
      }
    }

    return { entities, relations };
  }

  private buildFTSQuery(query: string): string {
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

  async openNodes(entityRefs: EntityReference[]): Promise<KnowledgeGraph> {
    if (entityRefs.length === 0) {
      return { entities: [], relations: [] };
    }

    const entities: Entity[] = [];
    const resolvedEntities: Array<{ id: number; name: string; entityType: string }> = [];

    // Resolve each entity reference (by ID or name/type)
    for (const ref of entityRefs) {
      const entity = this.resolveEntity(ref);
      if (entity) {
        resolvedEntities.push(entity);
      }
    }

    // Fetch full entity data with observations and properties
    for (const entity of resolvedEntities) {
      const entityProps = this.db
        .prepare('SELECT properties FROM entities WHERE id = ?')
        .get(entity.id) as { properties: string | null } | undefined;

      const observations = this.db
        .prepare('SELECT id, observation_type, content, timestamp, source, properties FROM observations WHERE entity_id = ?')
        .all(entity.id) as Array<{ id: number; observation_type: string; content: string; timestamp: string | null; source: string; properties: string | null }>;

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
          ...(o.properties && { properties: JSON.parse(o.properties) }),
        })),
        ...(entityProps?.properties && { properties: JSON.parse(entityProps.properties) }),
      });
    }

    const entityIdSet = new Set(entities.map(e => e.id));
    const relations: Relation[] = [];

    if (entities.length > 0) {
      // Get all relations between the requested entities
      const allRelationRows = this.db
        .prepare('SELECT id, from_entity_id, to_entity_id, relation_type, properties FROM relations')
        .all() as Array<{
        id: number;
        from_entity_id: number;
        to_entity_id: number;
        relation_type: string;
        properties: string | null;
      }>;

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
            ...(row.properties && { properties: JSON.parse(row.properties) }),
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
