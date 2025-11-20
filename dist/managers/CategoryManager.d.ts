import type { StorageAdapter } from '../types/graph.js';
export declare class CategoryManager {
    private baseDir;
    private storageCache;
    private pending;
    private lruOrder;
    private readonly maxConnections;
    constructor(baseDir: string, maxConnections?: number);
    validateCategoryName(category: string): void;
    private getDatabasePath;
    getStorageAdapter(category: string): Promise<StorageAdapter>;
    private updateLRU;
    private evictIfNeeded;
    listCategories(): Promise<string[]>;
    deleteCategory(category: string): Promise<void>;
    categoryExists(category: string): Promise<boolean>;
    closeAll(): void;
}
//# sourceMappingURL=CategoryManager.d.ts.map