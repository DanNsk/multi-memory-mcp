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

import { bench, describe } from 'vitest';
import { SQLiteStorage } from '../../src/storage/SQLiteStorage.js';
import { CategoryManager } from '../../src/managers/CategoryManager.js';
import { KnowledgeGraphManager } from '../../src/managers/KnowledgeGraphManager.js';
import type { Entity, Relation } from '../../src/types/graph.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCH_BASE_DIR = path.join(__dirname, 'bench-data');
const BENCH_DB = path.join(BENCH_BASE_DIR, 'bench.db');

describe('SQLite Storage Performance', () => {
  bench('create 100 entities', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: [`observation${i}`]
    }));

    await storage.createEntities(entities);
    storage.close();
  });

  bench('create 1000 entities', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: [`observation${i}`]
    }));

    await storage.createEntities(entities);
    storage.close();
  });

  bench('add observations to 100 entities', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: []
    }));

    await storage.createEntities(entities);

    const observations = entities.map(e => ({
      entityName: e.name,
      contents: ['obs1', 'obs2', 'obs3', 'obs4', 'obs5']
    }));

    await storage.addObservations(observations);
    storage.close();
  });

  bench('create 1000 relations', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: []
    }));

    await storage.createEntities(entities);

    const relations: Relation[] = [];
    for (let i = 0; i < 100; i++) {
      for (let j = 0; j < 10; j++) {
        if (i !== (i + j + 1) % 100) {
          relations.push({
            from: `Entity${i}`,
            to: `Entity${(i + j + 1) % 100}`,
            relationType: `rel${j}`
          });
        }
      }
    }

    await storage.createRelations(relations);
    storage.close();
  });

  bench('search in 1000 entities', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: i % 10 === 0 ? 'special' : 'normal',
      observations: [`observation${i}`, 'common data', `unique${i}`]
    }));

    await storage.createEntities(entities);

    await storage.searchNodes('Entity500');
    await storage.searchNodes('special');
    await storage.searchNodes('common');
    storage.close();
  });

  bench('load graph with 1000 entities and 5000 relations', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: [`obs1_${i}`, `obs2_${i}`, `obs3_${i}`]
    }));

    await storage.createEntities(entities);

    const relations: Relation[] = [];
    for (let i = 0; i < 1000; i++) {
      for (let j = 0; j < 5; j++) {
        relations.push({
          from: `Entity${i}`,
          to: `Entity${(i + j + 1) % 1000}`,
          relationType: `rel${j}`
        });
      }
    }

    await storage.createRelations(relations);

    await storage.loadGraph();
    storage.close();
  });

  bench('open nodes with 50 entities from 1000', async () => {
    await fs.rm(BENCH_DB, { force: true });
    const storage = new SQLiteStorage(BENCH_DB);

    const entities: Entity[] = Array.from({ length: 1000 }, (_, i) => ({
      name: `Entity${i}`,
      entityType: 'test',
      observations: [`obs${i}`]
    }));

    await storage.createEntities(entities);

    const relations: Relation[] = [];
    for (let i = 0; i < 1000; i++) {
      if (i < 999) {
        relations.push({
          from: `Entity${i}`,
          to: `Entity${i + 1}`,
          relationType: 'next'
        });
      }
    }

    await storage.createRelations(relations);

    const names = Array.from({ length: 50 }, (_, i) => `Entity${i * 20}`);
    await storage.openNodes(names);
    storage.close();
  });
});

describe('Category Manager Performance', () => {
  bench('create and access 50 categories', async () => {
    await fs.rm(BENCH_BASE_DIR, { recursive: true, force: true });
    const categoryManager = new CategoryManager(BENCH_BASE_DIR, 50);

    for (let i = 0; i < 50; i++) {
      await categoryManager.getStorageAdapter(`cat${i}`);
    }

    categoryManager.closeAll();
  });

  bench('LRU eviction with 100 categories (max 50)', async () => {
    await fs.rm(BENCH_BASE_DIR, { recursive: true, force: true });
    const categoryManager = new CategoryManager(BENCH_BASE_DIR, 50);

    for (let i = 0; i < 100; i++) {
      await categoryManager.getStorageAdapter(`cat${i}`);
    }

    categoryManager.closeAll();
  });

  bench('repeated access to same categories (cache hits)', async () => {
    await fs.rm(BENCH_BASE_DIR, { recursive: true, force: true });
    const categoryManager = new CategoryManager(BENCH_BASE_DIR, 50);

    const categories = Array.from({ length: 10 }, (_, i) => `cat${i}`);

    for (let round = 0; round < 10; round++) {
      for (const cat of categories) {
        await categoryManager.getStorageAdapter(cat);
      }
    }

    categoryManager.closeAll();
  });
});

describe('Knowledge Graph Manager Performance', () => {
  bench('multi-category operations (10 categories, 100 entities each)', async () => {
    await fs.rm(BENCH_BASE_DIR, { recursive: true, force: true });
    const categoryManager = new CategoryManager(BENCH_BASE_DIR);
    const kgManager = new KnowledgeGraphManager(categoryManager);

    for (let catIdx = 0; catIdx < 10; catIdx++) {
      const category = `category${catIdx}`;
      const entities: Entity[] = Array.from({ length: 100 }, (_, i) => ({
        name: `Entity${i}`,
        entityType: 'test',
        observations: [`obs${i}`]
      }));

      await kgManager.createEntities(entities, category);
    }

    kgManager.closeAll();
  });

  bench('cross-category searches', async () => {
    await fs.rm(BENCH_BASE_DIR, { recursive: true, force: true });
    const categoryManager = new CategoryManager(BENCH_BASE_DIR);
    const kgManager = new KnowledgeGraphManager(categoryManager);

    for (let catIdx = 0; catIdx < 5; catIdx++) {
      const category = `category${catIdx}`;
      const entities: Entity[] = Array.from({ length: 200 }, (_, i) => ({
        name: `Entity${i}`,
        entityType: i % 20 === 0 ? 'target' : 'normal',
        observations: [`obs${i}`]
      }));

      await kgManager.createEntities(entities, category);
    }

    for (let catIdx = 0; catIdx < 5; catIdx++) {
      await kgManager.searchNodes('target', `category${catIdx}`);
    }

    kgManager.closeAll();
  });
});
