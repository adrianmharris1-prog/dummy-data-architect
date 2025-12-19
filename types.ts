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
  AI = 'AI Creative (Gemini)'
}

export interface GenerationRule {
  type: GenerationStrategyType;
  config?: {
    pattern?: string; // e.g., "ORD-####" or "HEX-32"
    options?: string[]; // for Dropdown/Random
    delimiter?: string; // for Multi-value (e.g. "," or "|")
    aiPrompt?: string; // for Gemini
    referenceFileId?: string; // for Reference
  };
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
  rowCount: number; // Original row count
}

export interface Relationship {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
}

export interface ProjectState {
  tables: Table[];
  relationships: Relationship[];
}