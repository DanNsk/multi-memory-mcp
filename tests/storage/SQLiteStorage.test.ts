/*MIT License

Copyright (c) 2025 DanNsk

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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../../src/storage/SQLiteStorage.js';
import type { Entity, RelationInput } from '../../src/types/graph.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, 'test-db.sqlite');

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  beforeEach(async () => {
    await fs.rm(TEST_DB_PATH, { force: true });
    storage = new SQLiteStorage(TEST_DB_PATH);
  });

  afterEach(async () => {
    storage.close();
    await fs.rm(TEST_DB_PATH, { force: true });
  });

  describe('Schema Initialization', () => {
    it('should create database with proper schema', async () => {
      const graph = await storage.loadGraph();
      expect(graph).toEqual({ entities: [], relations: [] });
    });

    it('should initialize empty graph on new database', async () => {
      const graph = await storage.loadGraph();
      expect(graph.entities).toEqual([]);
      expect(graph.relations).toEqual([]);
    });
  });

  describe('Entity Operations', () => {
    it('should create single entity with IDs', async () => {
      const entities: Entity[] = [{
        name: 'TestEntity',
        entityType: 'test',
        observations: [{ text: 'observation1' }, { text: 'observation2' }]
      }];

      const created = await storage.createEntities(entities);
      expect(created).toHaveLength(1);
      expect(created[0].id).toBeDefined();
      expect(created[0].name).toBe('TestEntity');
      expect(created[0].observations[0].id).toBeDefined();
      expect(created[0].observations[1].id).toBeDefined();

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].id).toBeDefined();
      expect(graph.entities[0].name).toBe('TestEntity');
      expect(graph.entities[0].entityType).toBe('test');
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['observation1', 'observation2']);
    });

    it('should create multiple entities', async () => {
      const entities: Entity[] = [
        { name: 'Entity1', entityType: 'type1', observations: [{ text: 'obs1' }] },
        { name: 'Entity2', entityType: 'type2', observations: [{ text: 'obs2' }] },
        { name: 'Entity3', entityType: 'type3', observations: [{ text: 'obs3' }] }
      ];

      const created = await storage.createEntities(entities);
      expect(created).toHaveLength(3);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(3);
    });

    it('should ignore duplicate entity with same name and type', async () => {
      const entity: Entity = {
        name: 'Duplicate',
        entityType: 'test',
        observations: [{ text: 'obs1' }]
      };

      await storage.createEntities([entity]);
      const created = await storage.createEntities([entity]);

      expect(created).toHaveLength(0);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(1);
    });

    it('should allow same name with different entity types', async () => {
      const entity1: Entity = {
        name: 'SameName',
        entityType: 'type1',
        observations: [{ text: 'obs1' }]
      };
      const entity2: Entity = {
        name: 'SameName',
        entityType: 'type2',
        observations: [{ text: 'obs2' }]
      };

      await storage.createEntities([entity1]);
      const created = await storage.createEntities([entity2]);

      expect(created).toHaveLength(1);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(2);
      expect(graph.entities.map(e => e.entityType).sort()).toEqual(['type1', 'type2']);
    });

    it('should handle entity with empty observations', async () => {
      const entity: Entity = {
        name: 'NoObs',
        entityType: 'test',
        observations: []
      };

      await storage.createEntities([entity]);
      const graph = await storage.loadGraph();

      expect(graph.entities[0].observations).toEqual([]);
    });

    it('should handle entity with special characters in name', async () => {
      const entity: Entity = {
        name: 'Entity-With_Special.Chars',
        entityType: 'test',
        observations: [{ text: 'obs' }]
      };

      await storage.createEntities([entity]);
      const graph = await storage.loadGraph();

      expect(graph.entities[0].name).toBe('Entity-With_Special.Chars');
    });

    it('should handle very long observation text', async () => {
      const longText = 'a'.repeat(10000);
      const entity: Entity = {
        name: 'LongObs',
        entityType: 'test',
        observations: [{ text: longText }]
      };

      await storage.createEntities([entity]);
      const graph = await storage.loadGraph();

      expect(graph.entities[0].observations[0].text).toBe(longText);
    });
  });

  describe('Observation Operations', () => {
    beforeEach(async () => {
      await storage.createEntities([{
        name: 'TestEntity',
        entityType: 'test',
        observations: [{ text: 'initial' }]
      }]);
    });

    it('should add observations to existing entity', async () => {
      const result = await storage.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'obs1' }, { text: 'obs2' }]
      }]);

      expect(result[0].entityId).toBeDefined();
      expect(result[0].addedObservations.map(o => o.text)).toEqual(['obs1', 'obs2']);
      expect(result[0].addedObservations[0].id).toBeDefined();

      const graph = await storage.loadGraph();
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['initial', 'obs1', 'obs2']);
    });

    it('should add observations by entity ID', async () => {
      const graph = await storage.loadGraph();
      const entityId = graph.entities[0].id;

      const result = await storage.addObservations([{
        entityId,
        contents: [{ text: 'obs1' }]
      }]);

      expect(result[0].entityId).toBe(entityId);
      expect(result[0].addedObservations.map(o => o.text)).toEqual(['obs1']);
    });

    it('should not add duplicate observations', async () => {
      await storage.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'obs1' }]
      }]);

      const result = await storage.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'obs1' }, { text: 'obs2' }]
      }]);

      expect(result[0].addedObservations.map(o => o.text)).toEqual(['obs2']);
    });

    it('should throw error when adding observations to non-existent entity', async () => {
      await expect(storage.addObservations([{
        entityName: 'NonExistent',
        entityType: 'test',
        contents: [{ text: 'obs' }]
      }])).rejects.toThrow("Entity with name 'NonExistent' with type 'test' not found");
    });

    it('should delete observations from entity by text', async () => {
      await storage.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'obs1' }, { text: 'obs2' }, { text: 'obs3' }]
      }]);

      await storage.deleteObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        text: 'obs2'
      }]);

      const graph = await storage.loadGraph();
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['initial', 'obs1', 'obs3']);
    });

    it('should delete observations by ID', async () => {
      const result = await storage.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'obs1' }]
      }]);

      const obsId = result[0].addedObservations[0].id;

      await storage.deleteObservations([{ id: obsId }]);

      const graph = await storage.loadGraph();
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['initial']);
    });

    it('should handle deleting non-existent observations silently', async () => {
      await storage.deleteObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        text: 'nonexistent'
      }]);

      const graph = await storage.loadGraph();
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['initial']);
    });

    it('should handle deleting observations from non-existent entity silently', async () => {
      await expect(storage.deleteObservations([{
        entityName: 'NonExistent',
        entityType: 'test',
        text: 'obs'
      }])).resolves.not.toThrow();
    });
  });

  describe('Relation Operations', () => {
    beforeEach(async () => {
      await storage.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [] },
        { name: 'Entity2', entityType: 'type2', observations: [] }
      ]);
    });

    it('should create single relation with ID', async () => {
      const relations: RelationInput[] = [{
        from: { name: 'Entity1', type: 'type1' },
        to: { name: 'Entity2', type: 'type2' },
        relationType: 'depends_on'
      }];

      const created = await storage.createRelations(relations);
      expect(created).toHaveLength(1);
      expect(created[0].id).toBeDefined();
      expect(created[0].from).toBe('Entity1');
      expect(created[0].to).toBe('Entity2');

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].id).toBeDefined();
    });

    it('should create relations using entity IDs', async () => {
      const graph = await storage.loadGraph();
      const entity1Id = graph.entities.find(e => e.name === 'Entity1')!.id;
      const entity2Id = graph.entities.find(e => e.name === 'Entity2')!.id;

      const created = await storage.createRelations([{
        from: { id: entity1Id },
        to: { id: entity2Id },
        relationType: 'depends_on'
      }]);

      expect(created).toHaveLength(1);
      expect(created[0].from).toBe('Entity1');
      expect(created[0].to).toBe('Entity2');
    });

    it('should create multiple relations', async () => {
      const relations: RelationInput[] = [
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'type1' },
        { from: { name: 'Entity2', type: 'type2' }, to: { name: 'Entity1', type: 'type1' }, relationType: 'type2' }
      ];

      const created = await storage.createRelations(relations);
      expect(created).toHaveLength(2);

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(2);
    });

    it('should ignore duplicate relations', async () => {
      const relation: RelationInput = {
        from: { name: 'Entity1', type: 'type1' },
        to: { name: 'Entity2', type: 'type2' },
        relationType: 'depends_on'
      };

      await storage.createRelations([relation]);
      const created = await storage.createRelations([relation]);

      expect(created).toHaveLength(0);

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(1);
    });

    it('should allow same entities with different relation types', async () => {
      const relations: RelationInput[] = [
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'type1' },
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'type2' }
      ];

      const created = await storage.createRelations(relations);
      expect(created).toHaveLength(2);

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(2);
    });

    it('should delete specific relations by composite key', async () => {
      await storage.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'type1' },
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'type2' }
      ]);

      await storage.deleteRelations([
        { fromName: 'Entity1', fromType: 'type1', toName: 'Entity2', toType: 'type2', relationType: 'type1' }
      ]);

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].relationType).toBe('type2');
    });

    it('should delete relations by ID', async () => {
      const created = await storage.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'depends_on' }
      ]);

      await storage.deleteRelations([{ id: created[0].id }]);

      const graph = await storage.loadGraph();
      expect(graph.relations).toHaveLength(0);
    });

    it('should handle deleting non-existent relations silently', async () => {
      await expect(storage.deleteRelations([
        { fromName: 'Entity1', fromType: 'type1', toName: 'Entity2', toType: 'type2', relationType: 'nonexistent' }
      ])).resolves.not.toThrow();
    });
  });

  describe('Delete Entity Operations', () => {
    beforeEach(async () => {
      await storage.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [{ text: 'obs1' }] },
        { name: 'Entity2', entityType: 'type2', observations: [{ text: 'obs2' }] },
        { name: 'Entity3', entityType: 'type3', observations: [{ text: 'obs3' }] }
      ]);

      await storage.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'rel1' },
        { from: { name: 'Entity2', type: 'type2' }, to: { name: 'Entity3', type: 'type3' }, relationType: 'rel2' },
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity3', type: 'type3' }, relationType: 'rel3' }
      ]);
    });

    it('should delete entity and cascade relations', async () => {
      await storage.deleteEntities([{ name: 'Entity2', entityType: 'type2' }]);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(2);
      expect(graph.entities.find(e => e.name === 'Entity2')).toBeUndefined();
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Entity1');
      expect(graph.relations[0].to).toBe('Entity3');
    });

    it('should delete entity by ID', async () => {
      const graph = await storage.loadGraph();
      const entityId = graph.entities.find(e => e.name === 'Entity2')!.id;

      await storage.deleteEntities([{ id: entityId }]);

      const updatedGraph = await storage.loadGraph();
      expect(updatedGraph.entities.find(e => e.name === 'Entity2')).toBeUndefined();
    });

    it('should delete multiple entities', async () => {
      await storage.deleteEntities([
        { name: 'Entity1', entityType: 'type1' },
        { name: 'Entity2', entityType: 'type2' }
      ]);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Entity3');
      expect(graph.relations).toHaveLength(0);
    });

    it('should handle deleting non-existent entity silently', async () => {
      await expect(storage.deleteEntities([{ name: 'NonExistent', entityType: 'test' }])).resolves.not.toThrow();

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(3);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      await storage.createEntities([
        { name: 'UserService', entityType: 'service', observations: [{ text: 'Handles authentication' }, { text: 'Uses JWT' }] },
        { name: 'DatabaseClient', entityType: 'client', observations: [{ text: 'PostgreSQL connection' }] },
        { name: 'AuthController', entityType: 'controller', observations: [{ text: 'REST API endpoints' }] }
      ]);

      await storage.createRelations([
        { from: { name: 'AuthController', type: 'controller' }, to: { name: 'UserService', type: 'service' }, relationType: 'depends_on' },
        { from: { name: 'UserService', type: 'service' }, to: { name: 'DatabaseClient', type: 'client' }, relationType: 'uses' }
      ]);
    });

    it('should search by entity name and return IDs', async () => {
      const result = await storage.searchNodes('UserService');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('UserService');
      expect(result.entities[0].id).toBeDefined();
    });

    it('should search by entity type', async () => {
      const result = await storage.searchNodes('service');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].entityType).toBe('service');
    });

    it('should search by observation content', async () => {
      const result = await storage.searchNodes('authentication');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('UserService');
    });

    it('should be case-insensitive', async () => {
      const result = await storage.searchNodes('USERSERVICE');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('UserService');
    });

    it('should support partial matches', async () => {
      const result = await storage.searchNodes('User');
      expect(result.entities).toHaveLength(1);
    });

    it('should return only relations between found entities with IDs', async () => {
      const result = await storage.searchNodes('UserService');
      expect(result.relations).toHaveLength(2);
      expect(result.relations.every(r => r.id !== undefined)).toBe(true);
      expect(result.relations.every(r =>
        r.from === 'UserService' || r.to === 'UserService'
      )).toBe(true);
    });

    it('should return empty result for no matches', async () => {
      const result = await storage.searchNodes('NonExistent');
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('Open Nodes Operations', () => {
    beforeEach(async () => {
      await storage.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [{ text: 'obs1' }] },
        { name: 'Entity2', entityType: 'type2', observations: [{ text: 'obs2' }] },
        { name: 'Entity3', entityType: 'type3', observations: [{ text: 'obs3' }] }
      ]);

      await storage.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'rel1' },
        { from: { name: 'Entity2', type: 'type2' }, to: { name: 'Entity3', type: 'type3' }, relationType: 'rel2' }
      ]);
    });

    it('should open specific nodes by name and type', async () => {
      const result = await storage.openNodes([
        { name: 'Entity1', entityType: 'type1' },
        { name: 'Entity2', entityType: 'type2' }
      ]);
      expect(result.entities).toHaveLength(2);
      expect(result.entities.map(e => e.name).sort()).toEqual(['Entity1', 'Entity2']);
      expect(result.entities[0].id).toBeDefined();
    });

    it('should open nodes by ID', async () => {
      const graph = await storage.loadGraph();
      const entity1Id = graph.entities.find(e => e.name === 'Entity1')!.id;

      const result = await storage.openNodes([{ id: entity1Id }]);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Entity1');
    });

    it('should return only relations between opened nodes', async () => {
      const result = await storage.openNodes([
        { name: 'Entity1', entityType: 'type1' },
        { name: 'Entity2', entityType: 'type2' }
      ]);
      expect(result.relations).toHaveLength(1);
      expect(result.relations[0].from).toBe('Entity1');
      expect(result.relations[0].to).toBe('Entity2');
      expect(result.relations[0].id).toBeDefined();
    });

    it('should exclude relations to nodes not in list', async () => {
      const result = await storage.openNodes([{ name: 'Entity2', entityType: 'type2' }]);
      expect(result.entities).toHaveLength(1);
      expect(result.relations).toHaveLength(0);
    });

    it('should handle non-existent nodes silently', async () => {
      const result = await storage.openNodes([
        { name: 'Entity1', entityType: 'type1' },
        { name: 'NonExistent', entityType: 'test' }
      ]);
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('Entity1');
    });

    it('should return empty result for empty list', async () => {
      const result = await storage.openNodes([]);
      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });
  });

  describe('Transaction Safety', () => {
    it('should handle concurrent entity creations', async () => {
      const entities1: Entity[] = [
        { name: 'Entity1', entityType: 'type1', observations: [] }
      ];
      const entities2: Entity[] = [
        { name: 'Entity2', entityType: 'type2', observations: [] }
      ];

      await Promise.all([
        storage.createEntities(entities1),
        storage.createEntities(entities2)
      ]);

      const graph = await storage.loadGraph();
      expect(graph.entities).toHaveLength(2);
    });

    it('should maintain data integrity on multiple operations', async () => {
      const entity: Entity = { name: 'Test', entityType: 'type', observations: [{ text: 'obs1' }] };
      await storage.createEntities([entity]);

      await Promise.all([
        storage.addObservations([{ entityName: 'Test', entityType: 'type', contents: [{ text: 'obs2' }] }]),
        storage.addObservations([{ entityName: 'Test', entityType: 'type', contents: [{ text: 'obs3' }] }])
      ]);

      const graph = await storage.loadGraph();
      expect(graph.entities[0].observations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty entity array', async () => {
      const result = await storage.createEntities([]);
      expect(result).toEqual([]);
    });

    it('should handle empty relation array', async () => {
      const result = await storage.createRelations([]);
      expect(result).toEqual([]);
    });

    it('should handle Unicode characters in entity names', async () => {
      const entity: Entity = {
        name: 'Entity_测试_🚀',
        entityType: 'test',
        observations: [{ text: 'Unicode: 日本語' }]
      };

      await storage.createEntities([entity]);
      const graph = await storage.loadGraph();

      expect(graph.entities[0].name).toBe('Entity_测试_🚀');
      expect(graph.entities[0].observations[0].text).toBe('Unicode: 日本語');
    });

    it('should handle very large number of observations', async () => {
      const observations = Array.from({ length: 1000 }, (_, i) => ({ text: `obs${i}` }));
      const entity: Entity = {
        name: 'ManyObs',
        entityType: 'test',
        observations
      };

      await storage.createEntities([entity]);
      const graph = await storage.loadGraph();

      expect(graph.entities[0].observations).toHaveLength(1000);
    });

    it('should handle very large number of entities', async () => {
      const entities = Array.from({ length: 100 }, (_, i) => ({
        name: `Entity${i}`,
        entityType: 'test',
        observations: [{ text: `obs${i}` }]
      }));

      await storage.createEntities(entities);
      const graph = await storage.loadGraph();

      expect(graph.entities).toHaveLength(100);
    });
  });

  describe('Database Persistence', () => {
    it('should persist data across storage instances', async () => {
      const entity: Entity = {
        name: 'Persistent',
        entityType: 'test',
        observations: [{ text: 'data' }]
      };

      await storage.createEntities([entity]);
      storage.close();

      const newStorage = new SQLiteStorage(TEST_DB_PATH);
      const graph = await newStorage.loadGraph();

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Persistent');
      expect(graph.entities[0].entityType).toBe('test');
      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['data']);
      expect(graph.entities[0].id).toBeDefined();

      newStorage.close();
    });

    it('should handle database file being reopened', async () => {
      await storage.createEntities([
        { name: 'E1', entityType: 't1', observations: [{ text: 'o1' }] }
      ]);

      const graph1 = await storage.loadGraph();
      storage.close();

      const storage2 = new SQLiteStorage(TEST_DB_PATH);
      const graph2 = await storage2.loadGraph();

      expect(graph2.entities[0].name).toEqual(graph1.entities[0].name);
      expect(graph2.entities[0].id).toBeDefined();

      storage2.close();
    });
  });
});
