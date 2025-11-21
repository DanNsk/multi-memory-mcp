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

export interface Observation {
  id?: string;
  observationType?: string;
  text: string;
  timestamp?: string;
  source?: string;
}

export interface Entity {
  id?: string;
  name: string;
  entityType: string;
  observations: Observation[];
}

export interface Relation {
  id?: string;
  fromId: string;
  toId: string;
  relationType: string;
  // Resolved names for readability (populated on output)
  from?: string;
  fromType?: string;
  to?: string;
  toType?: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

// Identifier types for dual identification support
export interface EntityReference {
  id?: string;
  name?: string;
  entityType?: string;
}

// For relation endpoints - can identify by ID or name/type
export interface EntityEndpoint {
  id?: string;
  name?: string;
  type?: string;
}

// Relation identifier - can use relation ID, entity IDs, or entity names
export interface RelationIdentifier {
  id?: string;
  // By entity IDs
  fromId?: string;
  toId?: string;
  // By entity names (will be resolved to IDs)
  fromName?: string;
  fromType?: string;
  toName?: string;
  toType?: string;
  relationType?: string;
}

// Observation identifier for deletion - use id OR (entity + observationType + source)
export interface ObservationIdentifier {
  id?: string;
  entityId?: string;
  entityName?: string;
  entityType?: string;
  observationType?: string;
  source?: string;
}

// Input types for creating relations with flexible endpoints
export interface RelationInput {
  from: EntityEndpoint;
  to: EntityEndpoint;
  relationType: string;
}

// Result type for observation additions
export interface ObservationResult {
  entityId: string;
  entityName: string;
  entityType: string;
  addedObservations: Observation[];
}

export interface StorageAdapter {
  loadGraph(): Promise<KnowledgeGraph>;
  createEntities(entities: Entity[]): Promise<Entity[]>;
  createRelations(relations: RelationInput[]): Promise<Relation[]>;
  addObservations(observations: { entityId?: string; entityName?: string; entityType?: string; contents: Observation[] }[]): Promise<ObservationResult[]>;
  deleteEntities(entities: EntityReference[]): Promise<void>;
  deleteObservations(deletions: ObservationIdentifier[]): Promise<void>;
  deleteRelations(relations: RelationIdentifier[]): Promise<void>;
  searchNodes(query: string): Promise<KnowledgeGraph>;
  openNodes(entities: EntityReference[]): Promise<KnowledgeGraph>;
  close(): void;
}
