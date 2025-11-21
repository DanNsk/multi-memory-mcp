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

export class SQLiteStorage implements StorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeSchema();
  }

  private initializeSchema(): void {
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
        content TEXT NOT NULL,
        timestamp TEXT,
        source TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
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
    `);
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

    const entityRows = this.db.prepare('SELECT id, name, entity_type FROM entities').all() as Array<{
      id: number;
      name: string;
      entity_type: string;
    }>;

    for (const row of entityRows) {
      const observations = this.db
        .prepare('SELECT id, content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ id: number; content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        id: String(row.id),
        name: row.name,
        entityType: row.entity_type,
        observations: observations.map(o => ({
          id: String(o.id),
          text: o.content,
          ...(o.timestamp && { timestamp: o.timestamp }),
          ...(o.source && { source: o.source }),
        })),
      });
    }

    const relationRows = this.db
      .prepare('SELECT id, from_entity_id, to_entity_id, relation_type FROM relations')
      .all() as Array<{ id: number; from_entity_id: number; to_entity_id: number; relation_type: string }>;

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

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const insertEntity = this.db.prepare(
      'INSERT OR IGNORE INTO entities (name, entity_type) VALUES (?, ?)'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, content, timestamp, source) VALUES (?, ?, ?, ?)'
    );
    const getEntity = this.db.prepare('SELECT id, name, entity_type FROM entities WHERE name = ? AND entity_type = ?');

    const newEntities: Entity[] = [];

    const transaction = this.db.transaction((entitiesToCreate: Entity[]) => {
      for (const entity of entitiesToCreate) {
        const result = insertEntity.run(entity.name, entity.entityType);
        if (result.changes > 0) {
          const entityRow = getEntity.get(entity.name, entity.entityType) as { id: number; name: string; entity_type: string };
          const observationsWithIds: Observation[] = [];

          for (const observation of entity.observations) {
            const timestamp = observation.timestamp || new Date().toISOString();
            const obsResult = insertObservation.run(entityRow.id, observation.text, timestamp, observation.source || null);
            observationsWithIds.push({
              id: String(obsResult.lastInsertRowid),
              text: observation.text,
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

  async createRelations(relations: RelationInput[]): Promise<Relation[]> {
    const insertRelation = this.db.prepare(
      'INSERT OR IGNORE INTO relations (from_entity_id, to_entity_id, relation_type) VALUES (?, ?, ?)'
    );
    const getRelation = this.db.prepare(
      'SELECT id FROM relations WHERE from_entity_id = ? AND to_entity_id = ? AND relation_type = ?'
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

        const result = insertRelation.run(
          fromEntity.id,
          toEntity.id,
          relation.relationType
        );

        if (result.changes > 0) {
          const relationRow = getRelation.get(
            fromEntity.id,
            toEntity.id,
            relation.relationType
          ) as { id: number };

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

  async addObservations(
    observations: { entityId?: string; entityName?: string; entityType?: string; contents: Observation[] }[]
  ): Promise<ObservationResult[]> {
    const getExistingObservations = this.db.prepare(
      'SELECT content FROM observations WHERE entity_id = ?'
    );
    const insertObservation = this.db.prepare(
      'INSERT INTO observations (entity_id, content, timestamp, source) VALUES (?, ?, ?, ?)'
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

        const existingObs = getExistingObservations.all(entity.id) as Array<{ content: string }>;
        const existingSet = new Set(existingObs.map(o => o.content));

        const addedObservations: Observation[] = [];
        for (const observation of obs.contents) {
          if (!existingSet.has(observation.text)) {
            const timestamp = observation.timestamp || new Date().toISOString();
            const obsResult = insertObservation.run(entity.id, observation.text, timestamp, observation.source || null);
            addedObservations.push({
              id: String(obsResult.lastInsertRowid),
              text: observation.text,
              timestamp,
              ...(observation.source && { source: observation.source }),
            });
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
    const deleteObservationByContent = this.db.prepare(
      'DELETE FROM observations WHERE entity_id = ? AND content = ?'
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

          if (entity && deletion.text) {
            deleteObservationByContent.run(entity.id, deletion.text);
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

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const searchPattern = `%${query.toLowerCase()}%`;

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

    const entityIdSet = new Set<number>();
    for (const row of entityRows) {
      entityIdSet.add(row.id);
      const observations = this.db
        .prepare('SELECT id, content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(row.id) as Array<{ id: number; content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        id: String(row.id),
        name: row.name,
        entityType: row.entity_type,
        observations: observations.map(o => ({
          id: String(o.id),
          text: o.content,
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
        .prepare(
          `SELECT id, from_entity_id, to_entity_id, relation_type
           FROM relations
           WHERE from_entity_id IN (${placeholders}) OR to_entity_id IN (${placeholders})`
        )
        .all(...entityIds, ...entityIds) as Array<{ id: number; from_entity_id: number; to_entity_id: number; relation_type: string }>;

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

    // Fetch full entity data with observations
    for (const entity of resolvedEntities) {
      const observations = this.db
        .prepare('SELECT id, content, timestamp, source FROM observations WHERE entity_id = ?')
        .all(entity.id) as Array<{ id: number; content: string; timestamp: string | null; source: string | null }>;

      entities.push({
        id: String(entity.id),
        name: entity.name,
        entityType: entity.entityType,
        observations: observations.map(o => ({
          id: String(o.id),
          text: o.content,
          ...(o.timestamp && { timestamp: o.timestamp }),
          ...(o.source && { source: o.source }),
        })),
      });
    }

    const entityIdSet = new Set(entities.map(e => e.id));
    const relations: Relation[] = [];

    if (entities.length > 0) {
      // Get all relations between the requested entities
      const allRelationRows = this.db
        .prepare('SELECT id, from_entity_id, to_entity_id, relation_type FROM relations')
        .all() as Array<{
        id: number;
        from_entity_id: number;
        to_entity_id: number;
        relation_type: string;
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
