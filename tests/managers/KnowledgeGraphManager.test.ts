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
import { KnowledgeGraphManager } from '../../src/managers/KnowledgeGraphManager.js';
import { CategoryManager } from '../../src/managers/CategoryManager.js';
import type { Entity, RelationInput } from '../../src/types/graph.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_BASE_DIR = path.join(__dirname, 'test-kg');

describe('KnowledgeGraphManager', () => {
  let categoryManager: CategoryManager;
  let kgManager: KnowledgeGraphManager;

  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    categoryManager = new CategoryManager(TEST_BASE_DIR);
    kgManager = new KnowledgeGraphManager(categoryManager, 'default');
  });

  afterEach(async () => {
    kgManager.closeAll();
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  describe('Default Category Behavior', () => {
    it('should use default category when none specified', async () => {
      const entities: Entity[] = [{
        name: 'DefaultEntity',
        entityType: 'test',
        observations: [{ text: 'obs' }]
      }];

      await kgManager.createEntities(entities);
      const graph = await kgManager.readGraph();

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('DefaultEntity');
      expect(graph.entities[0].id).toBeDefined();
    });

    it('should create default category database file', async () => {
      await kgManager.createEntities([{
        name: 'Test',
        entityType: 'test',
        observations: []
      }]);

      const defaultPath = path.join(TEST_BASE_DIR, 'default.db');
      const stats = await fs.stat(defaultPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should use custom default category', async () => {
      const customManager = new KnowledgeGraphManager(categoryManager, 'custom');

      await customManager.createEntities([{
        name: 'Test',
        entityType: 'test',
        observations: []
      }]);

      const customPath = path.join(TEST_BASE_DIR, 'custom.db');
      const stats = await fs.stat(customPath);
      expect(stats.isFile()).toBe(true);
    });
  });

  describe('Entity Operations with Categories', () => {
    it('should create entities in specified category', async () => {
      const entities: Entity[] = [{
        name: 'WorkEntity',
        entityType: 'work',
        observations: [{ text: 'work obs' }]
      }];

      await kgManager.createEntities(entities, 'work');
      const graph = await kgManager.readGraph('work');

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('WorkEntity');
      expect(graph.entities[0].id).toBeDefined();
    });

    it('should isolate entities between categories', async () => {
      await kgManager.createEntities([{
        name: 'WorkEntity',
        entityType: 'work',
        observations: []
      }], 'work');

      await kgManager.createEntities([{
        name: 'PersonalEntity',
        entityType: 'personal',
        observations: []
      }], 'personal');

      const workGraph = await kgManager.readGraph('work');
      const personalGraph = await kgManager.readGraph('personal');

      expect(workGraph.entities).toHaveLength(1);
      expect(personalGraph.entities).toHaveLength(1);
      expect(workGraph.entities[0].name).toBe('WorkEntity');
      expect(personalGraph.entities[0].name).toBe('PersonalEntity');
    });

    it('should allow same entity name in different categories', async () => {
      const entity1: Entity = {
        name: 'Entity',
        entityType: 'type1',
        observations: [{ text: 'obs1' }]
      };

      const entity2: Entity = {
        name: 'Entity',
        entityType: 'type2',
        observations: [{ text: 'obs2' }]
      };

      await kgManager.createEntities([entity1], 'cat1');
      await kgManager.createEntities([entity2], 'cat2');

      const graph1 = await kgManager.readGraph('cat1');
      const graph2 = await kgManager.readGraph('cat2');

      expect(graph1.entities[0].entityType).toBe('type1');
      expect(graph2.entities[0].entityType).toBe('type2');
    });

    it('should return created entities with IDs', async () => {
      const entities: Entity[] = [
        { name: 'E1', entityType: 't1', observations: [{ text: 'o1' }] },
        { name: 'E2', entityType: 't2', observations: [{ text: 'o2' }] }
      ];

      const created = await kgManager.createEntities(entities, 'test');
      expect(created).toHaveLength(2);
      expect(created[0].id).toBeDefined();
      expect(created[1].id).toBeDefined();
    });
  });

  describe('Relation Operations with Categories', () => {
    beforeEach(async () => {
      await kgManager.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [] },
        { name: 'Entity2', entityType: 'type2', observations: [] }
      ], 'test');
    });

    it('should create relations in specified category', async () => {
      const relations: RelationInput[] = [{
        from: { name: 'Entity1', type: 'type1' },
        to: { name: 'Entity2', type: 'type2' },
        relationType: 'depends_on'
      }];

      const created = await kgManager.createRelations(relations, 'test');
      expect(created).toHaveLength(1);
      expect(created[0].id).toBeDefined();

      const graph = await kgManager.readGraph('test');
      expect(graph.relations).toHaveLength(1);
      expect(graph.relations[0].from).toBe('Entity1');
    });

    it('should isolate relations between categories', async () => {
      await kgManager.createEntities([
        { name: 'A', entityType: 't', observations: [] },
        { name: 'B', entityType: 't', observations: [] }
      ], 'cat1');

      await kgManager.createEntities([
        { name: 'C', entityType: 't', observations: [] },
        { name: 'D', entityType: 't', observations: [] }
      ], 'cat2');

      await kgManager.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'rel1' }
      ], 'test');

      await kgManager.createRelations([
        { from: { name: 'A', type: 't' }, to: { name: 'B', type: 't' }, relationType: 'rel2' }
      ], 'cat1');

      const testGraph = await kgManager.readGraph('test');
      const cat1Graph = await kgManager.readGraph('cat1');

      expect(testGraph.relations[0].relationType).toBe('rel1');
      expect(cat1Graph.relations[0].relationType).toBe('rel2');
    });

    it('should delete relations in specified category only', async () => {
      await kgManager.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'rel1' }
      ], 'test');

      await kgManager.createEntities([
        { name: 'X', entityType: 't', observations: [] },
        { name: 'Y', entityType: 't', observations: [] }
      ], 'other');

      await kgManager.createRelations([
        { from: { name: 'X', type: 't' }, to: { name: 'Y', type: 't' }, relationType: 'rel1' }
      ], 'other');

      await kgManager.deleteRelations([
        { fromName: 'Entity1', fromType: 'type1', toName: 'Entity2', toType: 'type2', relationType: 'rel1' }
      ], 'test');

      const testGraph = await kgManager.readGraph('test');
      const otherGraph = await kgManager.readGraph('other');

      expect(testGraph.relations).toHaveLength(0);
      expect(otherGraph.relations).toHaveLength(1);
    });
  });

  describe('Observation Operations with Categories', () => {
    beforeEach(async () => {
      await kgManager.createEntities([{
        name: 'TestEntity',
        entityType: 'test',
        observations: [{ text: 'initial' }]
      }], 'test');
    });

    it('should add observations in specified category', async () => {
      const result = await kgManager.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'new obs', observationType: 'note', source: 'added' }]
      }], 'test');

      expect(result[0].entityId).toBeDefined();
      expect(result[0].addedObservations.map(o => o.text)).toEqual(['new obs']);

      const graph = await kgManager.readGraph('test');
      expect(graph.entities[0].observations.map(o => o.text)).toContain('new obs');
    });

    it('should not affect observations in other categories', async () => {
      await kgManager.createEntities([{
        name: 'TestEntity',
        entityType: 'test',
        observations: [{ text: 'other obs' }]
      }], 'other');

      await kgManager.addObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        contents: [{ text: 'test obs', observationType: 'note', source: 'added' }]
      }], 'test');

      const testGraph = await kgManager.readGraph('test');
      const otherGraph = await kgManager.readGraph('other');

      expect(testGraph.entities[0].observations.map(o => o.text)).toContain('test obs');
      expect(otherGraph.entities[0].observations.map(o => o.text)).not.toContain('test obs');
    });

    it('should delete observations from specified category only', async () => {
      await kgManager.deleteObservations([{
        entityName: 'TestEntity',
        entityType: 'test',
        observationType: '',
        source: ''
      }], 'test');

      const graph = await kgManager.readGraph('test');
      expect(graph.entities[0].observations).toHaveLength(0);
    });
  });

  describe('Delete Entity Operations with Categories', () => {
    beforeEach(async () => {
      await kgManager.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [] },
        { name: 'Entity2', entityType: 'type2', observations: [] }
      ], 'test');

      await kgManager.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'rel' }
      ], 'test');
    });

    it('should delete entities from specified category only', async () => {
      await kgManager.createEntities([
        { name: 'Entity1', entityType: 'type', observations: [] }
      ], 'other');

      await kgManager.deleteEntities([{ name: 'Entity1', entityType: 'type1' }], 'test');

      const testGraph = await kgManager.readGraph('test');
      const otherGraph = await kgManager.readGraph('other');

      expect(testGraph.entities.find(e => e.name === 'Entity1')).toBeUndefined();
      expect(otherGraph.entities.find(e => e.name === 'Entity1')).toBeDefined();
    });

    it('should cascade delete relations in specified category', async () => {
      await kgManager.deleteEntities([{ name: 'Entity1', entityType: 'type1' }], 'test');

      const graph = await kgManager.readGraph('test');
      expect(graph.relations).toHaveLength(0);
    });
  });

  describe('Search Operations with Categories', () => {
    beforeEach(async () => {
      await kgManager.createEntities([
        { name: 'UserService', entityType: 'service', observations: [{ text: 'auth' }] },
        { name: 'DataService', entityType: 'service', observations: [{ text: 'data' }] }
      ], 'work');

      await kgManager.createEntities([
        { name: 'UserProfile', entityType: 'profile', observations: [{ text: 'personal' }] }
      ], 'personal');
    });

    it('should search within specified category', async () => {
      const result = await kgManager.searchNodes('UserService', 'work');

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('UserService');
      expect(result.entities[0].id).toBeDefined();
    });

    it('should not return results from other categories', async () => {
      const result = await kgManager.searchNodes('UserService', 'personal');

      expect(result.entities).toHaveLength(0);
    });

    it('should search in default category when none specified', async () => {
      await kgManager.createEntities([
        { name: 'DefaultEntity', entityType: 'test', observations: [] }
      ]);

      const result = await kgManager.searchNodes('DefaultEntity');
      expect(result.entities).toHaveLength(1);
    });
  });

  describe('Open Nodes Operations with Categories', () => {
    beforeEach(async () => {
      await kgManager.createEntities([
        { name: 'E1', entityType: 't1', observations: [] },
        { name: 'E2', entityType: 't2', observations: [] }
      ], 'cat1');

      await kgManager.createEntities([
        { name: 'E1', entityType: 't3', observations: [] }
      ], 'cat2');
    });

    it('should open nodes from specified category', async () => {
      const result = await kgManager.openNodes([
        { name: 'E1', entityType: 't1' },
        { name: 'E2', entityType: 't2' }
      ], 'cat1');

      expect(result.entities).toHaveLength(2);
      expect(result.entities.map(e => e.name).sort()).toEqual(['E1', 'E2']);
    });

    it('should not return nodes from other categories', async () => {
      const result = await kgManager.openNodes([
        { name: 'E1', entityType: 't3' },
        { name: 'E2', entityType: 't2' }
      ], 'cat2');

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].name).toBe('E1');
    });
  });

  describe('Category Management', () => {
    it('should list all categories', async () => {
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'work');
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'personal');
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'project');

      const categories = await kgManager.listCategories();
      expect(categories.sort()).toEqual(['personal', 'project', 'work']);
    });

    it('should delete entire category', async () => {
      await kgManager.createEntities([
        { name: 'E1', entityType: 't', observations: [] },
        { name: 'E2', entityType: 't', observations: [] }
      ], 'todelete');

      await kgManager.deleteCategory('todelete');

      const categories = await kgManager.listCategories();
      expect(categories).not.toContain('todelete');
    });

    it('should not affect other categories when deleting one', async () => {
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'keep');
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'delete');

      await kgManager.deleteCategory('delete');

      const categories = await kgManager.listCategories();
      expect(categories).toContain('keep');
      expect(categories).not.toContain('delete');
    });
  });

  describe('Multi-Category Workflows', () => {
    it('should support complex multi-category operations', async () => {
      await kgManager.createEntities([
        { name: 'WorkModule', entityType: 'module', observations: [{ text: 'work code' }] }
      ], 'work');

      await kgManager.createEntities([
        { name: 'PersonalNote', entityType: 'note', observations: [{ text: 'personal note' }] }
      ], 'personal');

      await kgManager.createEntities([
        { name: 'ProjectComponent', entityType: 'component', observations: [{ text: 'project code' }] }
      ], 'project-alpha');

      const workGraph = await kgManager.readGraph('work');
      const personalGraph = await kgManager.readGraph('personal');
      const projectGraph = await kgManager.readGraph('project-alpha');

      expect(workGraph.entities[0].name).toBe('WorkModule');
      expect(personalGraph.entities[0].name).toBe('PersonalNote');
      expect(projectGraph.entities[0].name).toBe('ProjectComponent');
    });

    it('should handle dependency graph per project', async () => {
      await kgManager.createEntities([
        { name: 'ModuleA', entityType: 'module', observations: [] },
        { name: 'ModuleB', entityType: 'module', observations: [] }
      ], 'project1');

      await kgManager.createRelations([
        { from: { name: 'ModuleA', type: 'module' }, to: { name: 'ModuleB', type: 'module' }, relationType: 'depends_on' }
      ], 'project1');

      await kgManager.createEntities([
        { name: 'ServiceX', entityType: 'service', observations: [] },
        { name: 'ServiceY', entityType: 'service', observations: [] }
      ], 'project2');

      await kgManager.createRelations([
        { from: { name: 'ServiceX', type: 'service' }, to: { name: 'ServiceY', type: 'service' }, relationType: 'calls' }
      ], 'project2');

      const project1 = await kgManager.readGraph('project1');
      const project2 = await kgManager.readGraph('project2');

      expect(project1.relations[0].relationType).toBe('depends_on');
      expect(project2.relations[0].relationType).toBe('calls');
    });
  });

  describe('Error Handling', () => {
    it('should propagate validation errors from CategoryManager', async () => {
      await expect(kgManager.createEntities([{
        name: 'Test',
        entityType: 'test',
        observations: []
      }], 'Invalid')).rejects.toThrow();
    });

    it('should handle errors when adding observations to non-existent entity', async () => {
      await expect(kgManager.addObservations([{
        entityName: 'NonExistent',
        entityType: 'test',
        contents: [{ text: 'obs' }]
      }], 'test')).rejects.toThrow();
    });
  });

  describe('CloseAll Operation', () => {
    it('should close all category storage adapters', async () => {
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'cat1');
      await kgManager.createEntities([{ name: 'E', entityType: 't', observations: [] }], 'cat2');

      kgManager.closeAll();

      const categories = await kgManager.listCategories();
      expect(categories.sort()).toEqual(['cat1', 'cat2']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty category parameter as default', async () => {
      await kgManager.createEntities([{
        name: 'Test',
        entityType: 'test',
        observations: []
      }], undefined);

      const graph = await kgManager.readGraph(undefined);
      expect(graph.entities).toHaveLength(1);
    });

    it('should handle rapid category switching', async () => {
      for (let i = 0; i < 10; i++) {
        await kgManager.createEntities([{
          name: `Entity${i}`,
          entityType: 'test',
          observations: []
        }], `cat${i % 3}`);
      }

      const cat0 = await kgManager.readGraph('cat0');
      const cat1 = await kgManager.readGraph('cat1');
      const cat2 = await kgManager.readGraph('cat2');

      expect(cat0.entities.length + cat1.entities.length + cat2.entities.length).toBe(10);
    });

    it('should maintain consistency across operations', async () => {
      await kgManager.createEntities([
        { name: 'E1', entityType: 't', observations: [{ text: 'obs1' }] }
      ], 'test');

      await kgManager.addObservations([{
        entityName: 'E1',
        entityType: 't',
        contents: [
          { text: 'obs2', observationType: 'note', source: 'add1' },
          { text: 'obs3', observationType: 'note', source: 'add2' }
        ]
      }], 'test');

      await kgManager.createRelations([
        { from: { name: 'E1', type: 't' }, to: { name: 'E1', type: 't' }, relationType: 'self-ref' }
      ], 'test');

      const graph = await kgManager.readGraph('test');

      expect(graph.entities[0].observations.map(o => o.text)).toEqual(['obs1', 'obs2', 'obs3']);
      expect(graph.relations).toHaveLength(1);
    });
  });
});
