export enum DataType {
  STRING = 'String',
  NUMBER = 'Number',
  DATE = 'Date',
  BOOLEAN = 'Boolean',
  DROPDOWN = 'Dropdown'
}

export enum GenerationStrategyType {
  COPY = 'Copy (Sample)',
  PATTERN = 'Pattern (ID)',
  RANDOM = 'Random Selection',
  REFERENCE = 'Reference File',
  AI = 'AI Creative (Gemini)',
  LINKED = 'Linked (From Parent)'
}

export interface GenerationRule {
  type: GenerationStrategyType;
  config?: {
    pattern?: string; // e.g., "ORD-####" or "HEX-32"
    options?: string[]; // for Dropdown/Random
    delimiter?: string; // for Multi-value (e.g. "," or "|")
    aiPrompt?: string; // for Gemini
    referenceFileId?: string; // for Reference
    linkedTableId?: string; // Explicit table link
    linkedColumnId?: string; // Explicit column link
  };
}

export interface TableGenerationSettings {
  mode: 'fixed' | 'per_parent';
  fixedCount: number; // Used if mode is 'fixed'
  minPerParent?: number; // Used if mode is 'per_parent'
  maxPerParent?: number; // Used if mode is 'per_parent'
  drivingParentTableId?: string; // The parent table that dictates the loop
}

export interface Column {
  id: string;
  name: string;
  type: DataType;
  isMultiValue: boolean;
  sampleValues: string[]; // First few rows from upload
  rule: GenerationRule;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  rowCount: number; // Legacy default
  genSettings?: TableGenerationSettings; // New configuration
  ui?: {
    x: number;
    y: number;
    width: number;
    height: number;
    scrollPos?: number; // Internal table scroll persistence
    isVisible?: boolean; // Whether table is on canvas or in sidebar
  };
}

export type Cardinality = '1:1' | '1:N' | 'N:M';

export interface Relationship {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  cardinality: Cardinality;
}

export interface ProjectState {
  tables: Table[];
  relationships: Relationship[];
  canvasScroll?: { x: number; y: number }; // Added for main canvas scroll persistence
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  state: ProjectState;
  currentStep: number;
}