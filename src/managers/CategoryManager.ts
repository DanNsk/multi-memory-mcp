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

import { promises as fs } from 'fs';
import path from 'path';
import type { StorageAdapter } from '../types/graph.js';
import { SQLiteStorage } from '../storage/SQLiteStorage.js';

export class CategoryManager {
  private storageCache: Map<string, StorageAdapter> = new Map();
  private pending: Map<string, Promise<StorageAdapter>> = new Map();

  constructor(private baseDir: string) {}

  validateCategoryName(category: string): void {
    if (!category || category.trim() === '') {
      throw new Error('Category name cannot be empty');
    }

    if (category.startsWith('.') || category.startsWith('..')) {
      throw new Error('Category name cannot start with dots');
    }

    if (!/^[a-z0-9-_]+$/.test(category)) {
      throw new Error(
        'Category name must contain only lowercase letters, numbers, hyphens, and underscores'
      );
    }
  }

  private getCategoryPath(category: string): string {
    return path.join(this.baseDir, category);
  }

  private getDatabasePath(category: string): string {
    return path.join(this.getCategoryPath(category), `${category}.db`);
  }

  async getStorageAdapter(category: string): Promise<StorageAdapter> {
    this.validateCategoryName(category);

    if (this.storageCache.has(category)) {
      return this.storageCache.get(category)!;
    }

    if (this.pending.has(category)) {
      return this.pending.get(category)!;
    }

    const promise = (async () => {
      const categoryPath = this.getCategoryPath(category);
      await fs.mkdir(categoryPath, { recursive: true });

      const dbPath = this.getDatabasePath(category);
      const storage = new SQLiteStorage(dbPath);

      this.storageCache.set(category, storage);
      this.pending.delete(category);
      return storage;
    })();

    this.pending.set(category, promise);
    return promise;
  }

  async listCategories(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      return entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async deleteCategory(category: string): Promise<void> {
    this.validateCategoryName(category);

    const storage = this.storageCache.get(category);
    if (storage) {
      storage.close();
      this.storageCache.delete(category);
    }

    const categoryPath = this.getCategoryPath(category);
    try {
      await fs.rm(categoryPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async categoryExists(category: string): Promise<boolean> {
    this.validateCategoryName(category);
    const categoryPath = this.getCategoryPath(category);
    try {
      const stats = await fs.stat(categoryPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  closeAll(): void {
    for (const storage of this.storageCache.values()) {
      storage.close();
    }
    this.storageCache.clear();
  }
}
