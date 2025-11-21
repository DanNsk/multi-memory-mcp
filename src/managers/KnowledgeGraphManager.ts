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

import type {
  Entity,
  Relation,
  KnowledgeGraph,
  Observation,
  EntityReference,
  RelationInput,
  RelationIdentifier,
  ObservationIdentifier,
  ObservationResult
} from '../types/graph.js';
import { CategoryManager } from './CategoryManager.js';

export class KnowledgeGraphManager {
  constructor(
    private categoryManager: CategoryManager,
    private defaultCategory: string = 'default'
  ) {}

  async createEntities(entities: Entity[], category?: string, override?: boolean): Promise<Entity[]> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.createEntities(entities, override);
  }

  async createRelations(relations: RelationInput[], category?: string, override?: boolean): Promise<Relation[]> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.createRelations(relations, override);
  }

  async addObservations(
    observations: { entityId?: string; entityName?: string; entityType?: string; contents: Observation[] }[],
    category?: string,
    override?: boolean
  ): Promise<ObservationResult[]> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.addObservations(observations, override);
  }

  async deleteEntities(entities: EntityReference[], category?: string): Promise<void> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.deleteEntities(entities);
  }

  async deleteObservations(
    deletions: ObservationIdentifier[],
    category?: string
  ): Promise<void> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.deleteObservations(deletions);
  }

  async deleteRelations(relations: RelationIdentifier[], category?: string): Promise<void> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.deleteRelations(relations);
  }

  async readGraph(category?: string): Promise<KnowledgeGraph> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.loadGraph();
  }

  async searchNodes(query: string, category?: string, limit?: number): Promise<KnowledgeGraph> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.searchNodes(query, limit);
  }

  async openNodes(entities: EntityReference[], category?: string): Promise<KnowledgeGraph> {
    const cat = category || this.defaultCategory;
    const storage = await this.categoryManager.getStorageAdapter(cat);
    return storage.openNodes(entities);
  }

  async listCategories(): Promise<string[]> {
    return this.categoryManager.listCategories();
  }

  async deleteCategory(category: string): Promise<void> {
    return this.categoryManager.deleteCategory(category);
  }

  closeAll(): void {
    this.categoryManager.closeAll();
  }
}
