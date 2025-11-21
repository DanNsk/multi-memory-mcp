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
export class KnowledgeGraphManager {
    categoryManager;
    defaultCategory;
    constructor(categoryManager, defaultCategory = 'default') {
        this.categoryManager = categoryManager;
        this.defaultCategory = defaultCategory;
    }
    async createEntities(entities, category, override) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.createEntities(entities, override);
    }
    async createRelations(relations, category, override) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.createRelations(relations, override);
    }
    async addObservations(observations, category, override) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.addObservations(observations, override);
    }
    async deleteEntities(entities, category) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.deleteEntities(entities);
    }
    async deleteObservations(deletions, category) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.deleteObservations(deletions);
    }
    async deleteRelations(relations, category) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.deleteRelations(relations);
    }
    async readGraph(category) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.loadGraph();
    }
    async searchNodes(query, category, limit) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.searchNodes(query, limit);
    }
    async openNodes(entities, category) {
        const cat = category || this.defaultCategory;
        const storage = await this.categoryManager.getStorageAdapter(cat);
        return storage.openNodes(entities);
    }
    async listCategories() {
        return this.categoryManager.listCategories();
    }
    async deleteCategory(category) {
        return this.categoryManager.deleteCategory(category);
    }
    closeAll() {
        this.categoryManager.closeAll();
    }
}
//# sourceMappingURL=KnowledgeGraphManager.js.map