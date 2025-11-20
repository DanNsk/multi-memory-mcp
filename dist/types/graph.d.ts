export interface Observation {
    text: string;
    timestamp?: string;
    source?: string;
}
export interface Entity {
    name: string;
    entityType: string;
    observations: Observation[];
}
export interface Relation {
    from: string;
    to: string;
    relationType: string;
}
export interface KnowledgeGraph {
    entities: Entity[];
    relations: Relation[];
}
export interface StorageAdapter {
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
//# sourceMappingURL=graph.d.ts.map