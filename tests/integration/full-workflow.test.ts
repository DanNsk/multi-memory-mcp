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
const TEST_BASE_DIR = path.join(__dirname, 'test-integration');

describe('Full Workflow Integration Tests', () => {
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

  describe('Personal Assistant Memory Workflow', () => {
    it('should manage work and personal contexts separately', async () => {
      await kgManager.createEntities([{
        name: 'Alice',
        entityType: 'colleague',
        observations: [{ text: 'Software engineer' }, { text: 'Works on frontend team' }]
      }], 'work');

      await kgManager.createEntities([{
        name: 'Alice',
        entityType: 'friend',
        observations: [{ text: 'Enjoys hiking' }, { text: 'Birthday in June' }]
      }], 'personal');

      const workGraph = await kgManager.readGraph('work');
      const personalGraph = await kgManager.readGraph('personal');

      expect(workGraph.entities[0].entityType).toBe('colleague');
      expect(personalGraph.entities[0].entityType).toBe('friend');
      expect(workGraph.entities[0].observations.map(o => o.text)).toContain('Software engineer');
      expect(personalGraph.entities[0].observations.map(o => o.text)).toContain('Enjoys hiking');
    });

    it('should support adding information over time', async () => {
      await kgManager.createEntities([{
        name: 'Project_Alpha',
        entityType: 'project',
        observations: [{ text: 'Started Q1 2025' }]
      }], 'work');

      await kgManager.addObservations([{
        entityName: 'Project_Alpha',
        entityType: 'project',
        contents: [{ text: 'Uses React and TypeScript' }, { text: 'Team of 5 developers' }]
      }], 'work');

      await kgManager.createEntities([{
        name: 'Sarah',
        entityType: 'colleague',
        observations: [{ text: 'Project lead' }]
      }], 'work');

      await kgManager.createRelations([{
        from: { name: 'Sarah', type: 'colleague' },
        to: { name: 'Project_Alpha', type: 'project' },
        relationType: 'leads'
      }], 'work');

      const graph = await kgManager.readGraph('work');

      expect(graph.entities).toHaveLength(2);
      expect(graph.entities.find(e => e.name === 'Project_Alpha')?.observations).toHaveLength(3);
      expect(graph.relations).toHaveLength(1);
    });
  });

  describe('Code Dependency Tracking Workflow', () => {
    it('should track dependencies for multiple projects', async () => {
      await kgManager.createEntities([
        { name: 'UserService', entityType: 'service', observations: [{ text: 'Handles authentication' }] },
        { name: 'DatabaseClient', entityType: 'client', observations: [{ text: 'PostgreSQL wrapper' }] },
        { name: 'AuthController', entityType: 'controller', observations: [{ text: 'REST API' }] }
      ], 'project-backend');

      await kgManager.createRelations([
        { from: { name: 'AuthController', type: 'controller' }, to: { name: 'UserService', type: 'service' }, relationType: 'depends_on' },
        { from: { name: 'UserService', type: 'service' }, to: { name: 'DatabaseClient', type: 'client' }, relationType: 'uses' }
      ], 'project-backend');

      await kgManager.createEntities([
        { name: 'LoginComponent', entityType: 'component', observations: [{ text: 'React component' }] },
        { name: 'APIClient', entityType: 'client', observations: [{ text: 'HTTP client' }] }
      ], 'project-frontend');

      await kgManager.createRelations([
        { from: { name: 'LoginComponent', type: 'component' }, to: { name: 'APIClient', type: 'client' }, relationType: 'uses' }
      ], 'project-frontend');

      const backendGraph = await kgManager.readGraph('project-backend');
      const frontendGraph = await kgManager.readGraph('project-frontend');

      expect(backendGraph.entities).toHaveLength(3);
      expect(backendGraph.relations).toHaveLength(2);
      expect(frontendGraph.entities).toHaveLength(2);
      expect(frontendGraph.relations).toHaveLength(1);
    });

    it('should support dependency analysis queries', async () => {
      await kgManager.createEntities([
        { name: 'ModuleA', entityType: 'module', observations: [{ text: 'Core module' }] },
        { name: 'ModuleB', entityType: 'module', observations: [{ text: 'Helper module' }] },
        { name: 'ModuleC', entityType: 'module', observations: [{ text: 'Utility module' }] },
        { name: 'ModuleD', entityType: 'module', observations: [{ text: 'Database module' }] }
      ], 'dependencies');

      await kgManager.createRelations([
        { from: { name: 'ModuleA', type: 'module' }, to: { name: 'ModuleB', type: 'module' }, relationType: 'imports' },
        { from: { name: 'ModuleA', type: 'module' }, to: { name: 'ModuleC', type: 'module' }, relationType: 'imports' },
        { from: { name: 'ModuleB', type: 'module' }, to: { name: 'ModuleD', type: 'module' }, relationType: 'imports' },
        { from: { name: 'ModuleC', type: 'module' }, to: { name: 'ModuleD', type: 'module' }, relationType: 'imports' }
      ], 'dependencies');

      const moduleADeps = await kgManager.openNodes([
        { name: 'ModuleA', entityType: 'module' },
        { name: 'ModuleB', entityType: 'module' },
        { name: 'ModuleC', entityType: 'module' }
      ], 'dependencies');
      expect(moduleADeps.relations.filter(r => r.from === 'ModuleA')).toHaveLength(2);

      const moduleDUsage = await kgManager.searchNodes('ModuleD', 'dependencies');
      const dependents = moduleDUsage.relations.filter(r => r.to === 'ModuleD');
      expect(dependents).toHaveLength(2);
    });
  });

  describe('Knowledge Graph Evolution', () => {
    it('should handle complete CRUD lifecycle', async () => {
      const category = 'test-lifecycle';

      await kgManager.createEntities([
        { name: 'Entity1', entityType: 'type1', observations: [{ text: 'initial' }] }
      ], category);

      let graph = await kgManager.readGraph(category);
      expect(graph.entities).toHaveLength(1);

      await kgManager.addObservations([{
        entityName: 'Entity1',
        entityType: 'type1',
        contents: [{ text: 'additional info' }]
      }], category);

      graph = await kgManager.readGraph(category);
      expect(graph.entities[0].observations).toHaveLength(2);

      await kgManager.createEntities([
        { name: 'Entity2', entityType: 'type2', observations: [] }
      ], category);

      await kgManager.createRelations([
        { from: { name: 'Entity1', type: 'type1' }, to: { name: 'Entity2', type: 'type2' }, relationType: 'relates_to' }
      ], category);

      graph = await kgManager.readGraph(category);
      expect(graph.entities).toHaveLength(2);
      expect(graph.relations).toHaveLength(1);

      await kgManager.deleteObservations([{
        entityName: 'Entity1',
        entityType: 'type1',
        text: 'initial'
      }], category);

      graph = await kgManager.readGraph(category);
      expect(graph.entities[0].observations).toHaveLength(1);

      await kgManager.deleteRelations([
        { from: 'Entity1', fromType: 'type1', to: 'Entity2', toType: 'type2', relationType: 'relates_to' }
      ], category);

      graph = await kgManager.readGraph(category);
      expect(graph.relations).toHaveLength(0);

      await kgManager.deleteEntities([{ name: 'Entity2', entityType: 'type2' }], category);

      graph = await kgManager.readGraph(category);
      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('Entity1');
    });
  });

  describe('Search and Discovery', () => {
    beforeEach(async () => {
      await kgManager.createEntities([
        { name: 'UserAuthentication', entityType: 'feature', observations: [{ text: 'Handles login' }, { text: 'Uses JWT' }] },
        { name: 'UserProfile', entityType: 'feature', observations: [{ text: 'Displays user info' }] },
        { name: 'AdminPanel', entityType: 'feature', observations: [{ text: 'Admin dashboard' }] },
        { name: 'DatabaseConnection', entityType: 'infrastructure', observations: [{ text: 'PostgreSQL' }] }
      ], 'features');

      await kgManager.createRelations([
        { from: { name: 'UserAuthentication', type: 'feature' }, to: { name: 'DatabaseConnection', type: 'infrastructure' }, relationType: 'uses' },
        { from: { name: 'UserProfile', type: 'feature' }, to: { name: 'DatabaseConnection', type: 'infrastructure' }, relationType: 'uses' },
        { from: { name: 'AdminPanel', type: 'feature' }, to: { name: 'UserAuthentication', type: 'feature' }, relationType: 'requires' }
      ], 'features');
    });

    it('should find entities by partial name match', async () => {
      const results = await kgManager.searchNodes('User', 'features');
      expect(results.entities).toHaveLength(2);
      expect(results.entities.map(e => e.name).sort()).toEqual(['UserAuthentication', 'UserProfile']);
    });

    it('should find entities by type', async () => {
      const results = await kgManager.searchNodes('feature', 'features');
      expect(results.entities).toHaveLength(3);
    });

    it('should find entities by observation content', async () => {
      const results = await kgManager.searchNodes('JWT', 'features');
      expect(results.entities).toHaveLength(1);
      expect(results.entities[0].name).toBe('UserAuthentication');
    });

    it('should include relevant relations in search results', async () => {
      const results = await kgManager.searchNodes('DatabaseConnection', 'features');
      expect(results.relations.length).toBeGreaterThan(0);
      expect(results.relations.every(r =>
        r.from === 'DatabaseConnection' || r.to === 'DatabaseConnection'
      )).toBe(true);
    });
  });

  describe('Data Persistence and Recovery', () => {
    it('should persist data across manager restarts', async () => {
      await kgManager.createEntities([
        { name: 'PersistentEntity', entityType: 'test', observations: [{ text: 'data' }] }
      ], 'persist');

      await kgManager.createRelations([
        { from: { name: 'PersistentEntity', type: 'test' }, to: { name: 'PersistentEntity', type: 'test' }, relationType: 'self' }
      ], 'persist');

      kgManager.closeAll();

      const newCategoryManager = new CategoryManager(TEST_BASE_DIR);
      const newKgManager = new KnowledgeGraphManager(newCategoryManager);

      const graph = await newKgManager.readGraph('persist');

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('PersistentEntity');
      expect(graph.relations).toHaveLength(1);

      newKgManager.closeAll();
    });

    it('should handle category deletion and recreation', async () => {
      await kgManager.createEntities([
        { name: 'E1', entityType: 't', observations: [] }
      ], 'temp');

      await kgManager.deleteCategory('temp');

      await kgManager.createEntities([
        { name: 'E2', entityType: 't', observations: [] }
      ], 'temp');

      const graph = await kgManager.readGraph('temp');

      expect(graph.entities).toHaveLength(1);
      expect(graph.entities[0].name).toBe('E2');
    });
  });

  describe('Complex Graph Operations', () => {
    it('should handle circular dependencies', async () => {
      await kgManager.createEntities([
        { name: 'A', entityType: 'module', observations: [] },
        { name: 'B', entityType: 'module', observations: [] },
        { name: 'C', entityType: 'module', observations: [] }
      ], 'circular');

      await kgManager.createRelations([
        { from: { name: 'A', type: 'module' }, to: { name: 'B', type: 'module' }, relationType: 'depends_on' },
        { from: { name: 'B', type: 'module' }, to: { name: 'C', type: 'module' }, relationType: 'depends_on' },
        { from: { name: 'C', type: 'module' }, to: { name: 'A', type: 'module' }, relationType: 'depends_on' }
      ], 'circular');

      const graph = await kgManager.readGraph('circular');

      expect(graph.relations).toHaveLength(3);

      const circularA = graph.relations.filter(r => r.from === 'A' || r.to === 'A');
      expect(circularA).toHaveLength(2);
    });

    it('should handle deep hierarchy', async () => {
      const entities: Entity[] = [];
      const relations: RelationInput[] = [];

      for (let i = 0; i < 10; i++) {
        entities.push({
          name: `Level${i}`,
          entityType: 'level',
          observations: [{ text: `Depth ${i}` }]
        });

        if (i > 0) {
          relations.push({
            from: { name: `Level${i-1}`, type: 'level' },
            to: { name: `Level${i}`, type: 'level' },
            relationType: 'parent_of'
          });
        }
      }

      await kgManager.createEntities(entities, 'hierarchy');
      await kgManager.createRelations(relations, 'hierarchy');

      const graph = await kgManager.readGraph('hierarchy');

      expect(graph.entities).toHaveLength(10);
      expect(graph.relations).toHaveLength(9);
    });

    it('should handle many-to-many relationships', async () => {
      await kgManager.createEntities([
        { name: 'Student1', entityType: 'student', observations: [] },
        { name: 'Student2', entityType: 'student', observations: [] },
        { name: 'Course1', entityType: 'course', observations: [] },
        { name: 'Course2', entityType: 'course', observations: [] }
      ], 'school');

      await kgManager.createRelations([
        { from: { name: 'Student1', type: 'student' }, to: { name: 'Course1', type: 'course' }, relationType: 'enrolled_in' },
        { from: { name: 'Student1', type: 'student' }, to: { name: 'Course2', type: 'course' }, relationType: 'enrolled_in' },
        { from: { name: 'Student2', type: 'student' }, to: { name: 'Course1', type: 'course' }, relationType: 'enrolled_in' },
        { from: { name: 'Student2', type: 'student' }, to: { name: 'Course2', type: 'course' }, relationType: 'enrolled_in' }
      ], 'school');

      const student1Courses = await kgManager.openNodes([
        { name: 'Student1', entityType: 'student' },
        { name: 'Course1', entityType: 'course' },
        { name: 'Course2', entityType: 'course' }
      ], 'school');
      expect(student1Courses.relations.filter(r => r.from === 'Student1')).toHaveLength(2);
    });
  });

  describe('Category Management Workflows', () => {
    it('should support project-based organization', async () => {
      const projects = ['project-alpha', 'project-beta', 'project-gamma'];

      for (const project of projects) {
        await kgManager.createEntities([
          { name: 'README', entityType: 'doc', observations: [{ text: `${project} documentation` }] }
        ], project);
      }

      const categories = await kgManager.listCategories();

      expect(categories).toHaveLength(projects.length);
      projects.forEach(project => {
        expect(categories).toContain(project);
      });
    });

    it('should support archiving old projects', async () => {
      await kgManager.createEntities([
        { name: 'OldFeature', entityType: 'feature', observations: [{ text: 'deprecated' }] }
      ], 'old-project');

      await kgManager.createEntities([
        { name: 'NewFeature', entityType: 'feature', observations: [{ text: 'active' }] }
      ], 'new-project');

      await kgManager.deleteCategory('old-project');

      const categories = await kgManager.listCategories();

      expect(categories).toContain('new-project');
      expect(categories).not.toContain('old-project');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent writes to different categories', async () => {
      await Promise.all([
        kgManager.createEntities([{ name: 'E1', entityType: 't', observations: [] }], 'cat1'),
        kgManager.createEntities([{ name: 'E2', entityType: 't', observations: [] }], 'cat2'),
        kgManager.createEntities([{ name: 'E3', entityType: 't', observations: [] }], 'cat3')
      ]);

      const [graph1, graph2, graph3] = await Promise.all([
        kgManager.readGraph('cat1'),
        kgManager.readGraph('cat2'),
        kgManager.readGraph('cat3')
      ]);

      expect(graph1.entities[0].name).toBe('E1');
      expect(graph2.entities[0].name).toBe('E2');
      expect(graph3.entities[0].name).toBe('E3');
    });

    it('should handle concurrent reads', async () => {
      await kgManager.createEntities([
        { name: 'Shared', entityType: 'test', observations: [{ text: 'data' }] }
      ], 'shared');

      const results = await Promise.all([
        kgManager.readGraph('shared'),
        kgManager.readGraph('shared'),
        kgManager.readGraph('shared')
      ]);

      results.forEach(graph => {
        expect(graph.entities).toHaveLength(1);
        expect(graph.entities[0].name).toBe('Shared');
      });
    });
  });

  describe('Real-World Use Case: Code Documentation', () => {
    it('should track codebase structure and documentation', async () => {
      await kgManager.createEntities([
        { name: 'AuthService', entityType: 'class', observations: [
          { text: 'Located in src/services/auth.ts' },
          { text: 'Exports login, logout, validateToken methods' },
          { text: 'Uses bcrypt for password hashing' }
        ]},
        { name: 'UserModel', entityType: 'class', observations: [
          { text: 'Database model for users' },
          { text: 'Fields: id, email, passwordHash, createdAt' }
        ]},
        { name: 'JWT', entityType: 'library', observations: [
          { text: 'jsonwebtoken npm package' },
          { text: 'Used for token generation' }
        ]}
      ], 'codebase-docs');

      await kgManager.createRelations([
        { from: { name: 'AuthService', type: 'class' }, to: { name: 'UserModel', type: 'class' }, relationType: 'uses' },
        { from: { name: 'AuthService', type: 'class' }, to: { name: 'JWT', type: 'library' }, relationType: 'imports' }
      ], 'codebase-docs');

      const authInfo = await kgManager.searchNodes('AuthService', 'codebase-docs');

      expect(authInfo.entities[0].observations.map(o => o.text)).toContain('Located in src/services/auth.ts');
      expect(authInfo.relations.filter(r => r.from === 'AuthService')).toHaveLength(2);

      const jwtUsage = await kgManager.searchNodes('JWT', 'codebase-docs');
      const authUsesJwt = jwtUsage.relations.find(r =>
        r.from === 'AuthService' && r.to === 'JWT'
      );

      expect(authUsesJwt).toBeDefined();
    });
  });
});
