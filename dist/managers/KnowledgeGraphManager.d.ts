import type { Entity, Relation, KnowledgeGraph, Observation } from '../types/graph.js';
import { CategoryManager } from './CategoryManager.js';
export declare class KnowledgeGraphManager {
    private categoryManager;
    private defaultCategory;
    constructor(categoryManager: CategoryManager, defaultCategory?: string);
    createEntities(entities: Entity[], category?: string): Promise<Entity[]>;
    createRelations(relations: Relation[], category?: string): Promise<Relation[]>;
    addObservations(observations: {
        entityName: string;
        contents: Observation[];
    }[], category?: string): Promise<{
        entityName: string;
        addedObservations: Observation[];
    }[]>;
    deleteEntities(entityNames: string[], category?: string): Promise<void>;
    deleteObservations(deletions: {
        entityName: string;
        observations: Observation[];
    }[], category?: string): Promise<void>;
    deleteRelations(relations: Relation[], category?: string): Promise<void>;
    readGraph(category?: string): Promise<KnowledgeGraph>;
    searchNodes(query: string, category?: string): Promise<KnowledgeGraph>;
    openNodes(names: string[], category?: string): Promise<KnowledgeGraph>;
    listCategories(): Promise<string[]>;
    deleteCategory(category: string): Promise<void>;
    closeAll(): void;
}
//# sourceMappingURL=KnowledgeGraphManager.d.ts.map