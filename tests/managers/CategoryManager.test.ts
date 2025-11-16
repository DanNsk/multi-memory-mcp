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
import { CategoryManager } from '../../src/managers/CategoryManager.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_BASE_DIR = path.join(__dirname, 'test-categories');

describe('CategoryManager', () => {
  let categoryManager: CategoryManager;

  beforeEach(async () => {
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
    categoryManager = new CategoryManager(TEST_BASE_DIR);
  });

  afterEach(async () => {
    categoryManager.closeAll();
    await fs.rm(TEST_BASE_DIR, { recursive: true, force: true });
  });

  describe('Category Name Validation', () => {
    it('should accept valid category names', () => {
      expect(() => categoryManager.validateCategoryName('work')).not.toThrow();
      expect(() => categoryManager.validateCategoryName('personal')).not.toThrow();
      expect(() => categoryManager.validateCategoryName('project-alpha')).not.toThrow();
      expect(() => categoryManager.validateCategoryName('test_category')).not.toThrow();
      expect(() => categoryManager.validateCategoryName('category123')).not.toThrow();
      expect(() => categoryManager.validateCategoryName('a')).not.toThrow();
    });

    it('should reject empty category name', () => {
      expect(() => categoryManager.validateCategoryName('')).toThrow('Category name cannot be empty');
      expect(() => categoryManager.validateCategoryName('   ')).toThrow('Category name cannot be empty');
    });

    it('should reject category names with uppercase letters', () => {
      expect(() => categoryManager.validateCategoryName('Work')).toThrow(
        'Category name must contain only lowercase letters, numbers, hyphens, and underscores'
      );
      expect(() => categoryManager.validateCategoryName('WORK')).toThrow();
      expect(() => categoryManager.validateCategoryName('myCategory')).toThrow();
    });

    it('should reject category names with special characters', () => {
      expect(() => categoryManager.validateCategoryName('work!')).toThrow();
      expect(() => categoryManager.validateCategoryName('work@home')).toThrow();
      expect(() => categoryManager.validateCategoryName('work#1')).toThrow();
      expect(() => categoryManager.validateCategoryName('work space')).toThrow();
      expect(() => categoryManager.validateCategoryName('work/sub')).toThrow();
      expect(() => categoryManager.validateCategoryName('work\\sub')).toThrow();
    });

    it('should reject category names starting with dots', () => {
      expect(() => categoryManager.validateCategoryName('.work')).toThrow(
        'Category name cannot start with dots'
      );
      expect(() => categoryManager.validateCategoryName('..work')).toThrow();
    });

    it('should reject path traversal attempts', () => {
      expect(() => categoryManager.validateCategoryName('..')).toThrow();
      expect(() => categoryManager.validateCategoryName('../etc')).toThrow();
      expect(() => categoryManager.validateCategoryName('.hidden')).toThrow();
    });
  });

  describe('Storage Adapter Management', () => {
    it('should create storage adapter for valid category', async () => {
      const storage = await categoryManager.getStorageAdapter('work');
      expect(storage).toBeDefined();

      const dbPath = path.join(TEST_BASE_DIR, 'work.db');
      const stats = await fs.stat(dbPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should create base directory if it does not exist', async () => {
      await categoryManager.getStorageAdapter('newcategory');

      const baseStats = await fs.stat(TEST_BASE_DIR);
      expect(baseStats.isDirectory()).toBe(true);
    });

    it('should create database file in base directory', async () => {
      await categoryManager.getStorageAdapter('testcat');

      const dbPath = path.join(TEST_BASE_DIR, 'testcat.db');
      const stats = await fs.stat(dbPath);
      expect(stats.isFile()).toBe(true);
    });

    it('should cache storage adapters', async () => {
      const storage1 = await categoryManager.getStorageAdapter('cached');
      const storage2 = await categoryManager.getStorageAdapter('cached');

      expect(storage1).toBe(storage2);
    });

    it('should create separate adapters for different categories', async () => {
      const storage1 = await categoryManager.getStorageAdapter('cat1');
      const storage2 = await categoryManager.getStorageAdapter('cat2');

      expect(storage1).not.toBe(storage2);
    });

    it('should handle multiple categories', async () => {
      await categoryManager.getStorageAdapter('work');
      await categoryManager.getStorageAdapter('personal');
      await categoryManager.getStorageAdapter('project-alpha');

      const workPath = path.join(TEST_BASE_DIR, 'work.db');
      const personalPath = path.join(TEST_BASE_DIR, 'personal.db');
      const projectPath = path.join(TEST_BASE_DIR, 'project-alpha.db');

      expect((await fs.stat(workPath)).isFile()).toBe(true);
      expect((await fs.stat(personalPath)).isFile()).toBe(true);
      expect((await fs.stat(projectPath)).isFile()).toBe(true);
    });

    it('should reject invalid category names when getting adapter', async () => {
      await expect(categoryManager.getStorageAdapter('Invalid')).rejects.toThrow();
      await expect(categoryManager.getStorageAdapter('../etc')).rejects.toThrow();
      await expect(categoryManager.getStorageAdapter('')).rejects.toThrow();
    });
  });

  describe('List Categories', () => {
    it('should return empty array when no categories exist', async () => {
      const categories = await categoryManager.listCategories();
      expect(categories).toEqual([]);
    });

    it('should list single category', async () => {
      await categoryManager.getStorageAdapter('work');

      const categories = await categoryManager.listCategories();
      expect(categories).toEqual(['work']);
    });

    it('should list multiple categories', async () => {
      await categoryManager.getStorageAdapter('work');
      await categoryManager.getStorageAdapter('personal');
      await categoryManager.getStorageAdapter('project-alpha');

      const categories = await categoryManager.listCategories();
      expect(categories.sort()).toEqual(['personal', 'project-alpha', 'work']);
    });

    it('should only list .db files', async () => {
      await categoryManager.getStorageAdapter('category1');
      await fs.mkdir(TEST_BASE_DIR, { recursive: true });
      await fs.writeFile(path.join(TEST_BASE_DIR, 'somefile.txt'), 'content');
      await fs.mkdir(path.join(TEST_BASE_DIR, 'somedir'));

      const categories = await categoryManager.listCategories();
      expect(categories).toEqual(['category1']);
    });

    it('should handle base directory not existing', async () => {
      const newManager = new CategoryManager(path.join(TEST_BASE_DIR, 'nonexistent'));
      const categories = await newManager.listCategories();
      expect(categories).toEqual([]);
    });
  });

  describe('Category Existence Check', () => {
    it('should return false for non-existent category', async () => {
      const exists = await categoryManager.categoryExists('nonexistent');
      expect(exists).toBe(false);
    });

    it('should return true for existing category', async () => {
      await categoryManager.getStorageAdapter('existing');

      const exists = await categoryManager.categoryExists('existing');
      expect(exists).toBe(true);
    });

    it('should return false for directory instead of .db file', async () => {
      await fs.mkdir(TEST_BASE_DIR, { recursive: true });
      await fs.mkdir(path.join(TEST_BASE_DIR, 'notfile'));

      const exists = await categoryManager.categoryExists('notfile');
      expect(exists).toBe(false);
    });

    it('should validate category name before checking existence', async () => {
      await expect(categoryManager.categoryExists('Invalid')).rejects.toThrow();
      await expect(categoryManager.categoryExists('../etc')).rejects.toThrow();
    });
  });

  describe('Delete Category', () => {
    it('should delete category database file', async () => {
      await categoryManager.getStorageAdapter('todelete');
      const dbPath = path.join(TEST_BASE_DIR, 'todelete.db');

      expect((await fs.stat(dbPath)).isFile()).toBe(true);

      await categoryManager.deleteCategory('todelete');

      await expect(fs.stat(dbPath)).rejects.toThrow();
    });

    it('should remove category from cache after deletion', async () => {
      const storage1 = await categoryManager.getStorageAdapter('cached');
      await categoryManager.deleteCategory('cached');
      const storage2 = await categoryManager.getStorageAdapter('cached');

      expect(storage1).not.toBe(storage2);
    });

    it('should handle deleting non-existent category silently', async () => {
      await expect(categoryManager.deleteCategory('nonexistent')).resolves.not.toThrow();
    });

    it('should validate category name before deletion', async () => {
      await expect(categoryManager.deleteCategory('Invalid')).rejects.toThrow();
      await expect(categoryManager.deleteCategory('../etc')).rejects.toThrow();
    });

    it('should delete only specified category', async () => {
      await categoryManager.getStorageAdapter('keep');
      await categoryManager.getStorageAdapter('delete');

      await categoryManager.deleteCategory('delete');

      const categories = await categoryManager.listCategories();
      expect(categories).toEqual(['keep']);
    });

    it('should delete category with all its contents', async () => {
      const storage = await categoryManager.getStorageAdapter('withdata');
      await storage.createEntities([{
        name: 'TestEntity',
        entityType: 'test',
        observations: ['data']
      }]);

      await categoryManager.deleteCategory('withdata');

      const dbPath = path.join(TEST_BASE_DIR, 'withdata.db');
      await expect(fs.stat(dbPath)).rejects.toThrow();
    });
  });

  describe('Close All', () => {
    it('should close all cached storage adapters', async () => {
      await categoryManager.getStorageAdapter('cat1');
      await categoryManager.getStorageAdapter('cat2');
      await categoryManager.getStorageAdapter('cat3');

      categoryManager.closeAll();

      const categories = await categoryManager.listCategories();
      expect(categories).toHaveLength(3);
    });

    it('should clear cache after closing all', async () => {
      const storage1 = await categoryManager.getStorageAdapter('test');
      categoryManager.closeAll();
      const storage2 = await categoryManager.getStorageAdapter('test');

      expect(storage1).not.toBe(storage2);
    });

    it('should allow operations after closeAll', async () => {
      await categoryManager.getStorageAdapter('test1');
      categoryManager.closeAll();

      await expect(categoryManager.getStorageAdapter('test2')).resolves.toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent category creations', async () => {
      await Promise.all([
        categoryManager.getStorageAdapter('concurrent1'),
        categoryManager.getStorageAdapter('concurrent2'),
        categoryManager.getStorageAdapter('concurrent3')
      ]);

      const categories = await categoryManager.listCategories();
      expect(categories.sort()).toEqual(['concurrent1', 'concurrent2', 'concurrent3']);
    });

    it('should handle same category requested concurrently', async () => {
      const [storage1, storage2, storage3] = await Promise.all([
        categoryManager.getStorageAdapter('same'),
        categoryManager.getStorageAdapter('same'),
        categoryManager.getStorageAdapter('same')
      ]);

      expect(storage1).toBe(storage2);
      expect(storage2).toBe(storage3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long category names', async () => {
      const longName = 'a'.repeat(100);
      const storage = await categoryManager.getStorageAdapter(longName);
      expect(storage).toBeDefined();

      const categories = await categoryManager.listCategories();
      expect(categories).toContain(longName);
    });

    it('should handle category names with all allowed special characters', async () => {
      const name = 'test-name_with-underscores_and-hyphens-123';
      const storage = await categoryManager.getStorageAdapter(name);
      expect(storage).toBeDefined();
    });

    it('should handle rapid create and delete cycles', async () => {
      for (let i = 0; i < 5; i++) {
        await categoryManager.getStorageAdapter('cycle');
        await categoryManager.deleteCategory('cycle');
      }

      const categories = await categoryManager.listCategories();
      expect(categories).not.toContain('cycle');
    });

    it('should maintain data isolation between categories', async () => {
      const storage1 = await categoryManager.getStorageAdapter('isolated1');
      const storage2 = await categoryManager.getStorageAdapter('isolated2');

      await storage1.createEntities([{
        name: 'Entity1',
        entityType: 'type1',
        observations: ['obs1']
      }]);

      const graph1 = await storage1.loadGraph();
      const graph2 = await storage2.loadGraph();

      expect(graph1.entities).toHaveLength(1);
      expect(graph2.entities).toHaveLength(0);
    });
  });

  describe('File System Integration', () => {
    it('should create flat file structure', async () => {
      await categoryManager.getStorageAdapter('category');

      const baseStats = await fs.stat(TEST_BASE_DIR);
      const dbPath = path.join(TEST_BASE_DIR, 'category.db');
      const dbStats = await fs.stat(dbPath);

      expect(baseStats.isDirectory()).toBe(true);
      expect(dbStats.isFile()).toBe(true);
    });

    it('should handle base directory creation', async () => {
      const deepPath = path.join(TEST_BASE_DIR, 'deep', 'nested', 'path');
      const manager = new CategoryManager(deepPath);

      await manager.getStorageAdapter('test');

      const baseStats = await fs.stat(deepPath);
      const dbPath = path.join(deepPath, 'test.db');
      const dbStats = await fs.stat(dbPath);
      expect(baseStats.isDirectory()).toBe(true);
      expect(dbStats.isFile()).toBe(true);

      manager.closeAll();
    });

    it('should preserve existing category when creating adapter', async () => {
      const storage1 = await categoryManager.getStorageAdapter('preserve');
      await storage1.createEntities([{
        name: 'Entity',
        entityType: 'test',
        observations: ['data']
      }]);

      categoryManager.closeAll();

      const storage2 = await categoryManager.getStorageAdapter('preserve');
      const graph = await storage2.loadGraph();

      expect(graph.entities).toHaveLength(1);
    });
  });
});
