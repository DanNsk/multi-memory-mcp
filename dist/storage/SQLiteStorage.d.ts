import type { Entity, Relation, KnowledgeGraph, StorageAdapter, Observation } from '../types/graph.js';
export declare class SQLiteStorage implements StorageAdapter {
    private db;
    constructor(dbPath: string);
    private initializeSchema;
    private ensureSchemaVersion;
    private migrateSchema;
    loadGraph(): Promise<KnowledgeGraph>;
    createEntities(entities: Entity[]): Promise<Entity[]>;
    createRelations(relations: Relation[]): Promise<Relation[]>;
    addObservations(observations: {
        entityName: string;
        contents: Observation[];
    }[]): Promise<{
        entityName: string;
        addedObservations: Observation[];
    }[]>;
    deleteEntities(entityNames: string[]): Promise<void>;
    deleteObservations(deletions: {
        entityName: string;
        observations: Observation[];
    }[]): Promise<void>;
    deleteRelations(relations: Relation[]): Promise<void>;
    searchNodes(query: string): Promise<KnowledgeGraph>;
    openNodes(names: string[]): Promise<KnowledgeGraph>;
    close(): void;
}
//# sourceMappingURL=SQLiteStorage.d.ts.map