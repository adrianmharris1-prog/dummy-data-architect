export enum DataType {
  STRING = 'String',
  TEXT_AREA = 'Text Area',
  INTEGER = 'Integer',
  REAL = 'Real',
  DATE = 'Date',
  BOOLEAN = 'Boolean',
  DROPDOWN = 'Dropdown',
  MULTI_SELECT = 'Multi-select',
  REVISION = 'Revision',
  DURATION = 'Duration'
}

export enum GenerationStrategyType {
  COPY = 'Copy (Sample)',
  PATTERN = 'Pattern (ID)',
  RANDOM = 'Random Selection',
  REFERENCE = 'Reference File',
  AI = 'AI Creative (Gemini)',
  LINKED = 'Linked (From Parent)',
  CALCULATE_DURATION = 'Calculate Duration',
  DATE = 'Date Logic',
  RANDOM_RECORD = 'Random Record from Table',
  LIFECYCLE_DATE = 'Lifecycle Date',
  LIFECYCLE_DURATION = 'Lifecycle Duration'
}

export interface ReferenceFile {
  id: string;
  name: string;
  values: string[];
  isGlobalAnchor?: boolean;
}

export interface DateLogicConfig {
  mode: 'Now' | 'Column' | 'Between';
  operator?: 'Before' | 'OnBefore' | 'After' | 'OnAfter';
  refTable1?: string;
  refCol1?: string;
  refTable2?: string;
  refCol2?: string;
  minOffset?: number;
  maxOffset?: number;
}

export interface GenerationRule {
  type: GenerationStrategyType;
  config?: {
    pattern?: string;
    options?: string[];
    delimiter?: string;
    aiPrompt?: string;
    dependentColumnIds?: string[];
    referenceFileId?: string;
    isAnchor?: boolean; // Pinned value for the thread
    linkedTableId?: string;
    linkedColumnId?: string;
    registryLinkTableId?: string; // Pull from thread registry (deprecated in favor of linkedTableId)
    dateFormat?: string;
    dateLogic?: DateLogicConfig;
    label?: string;
    linkedSources?: {
      tableId: string;
      columnId: string;
      joinKey?: string;
    }[];
    relativeDateConfig?: {
      sourceColumnId: string;
      minDays: number;
      maxDays: number;
      direction: 'before' | 'after';
      isLinkedSource?: boolean;
    };
    // Duration specific fields
    startTableId?: string;
    startColId?: string;
    endTableId?: string;
    endColId?: string;
    unit?: 'Hours' | 'Days' | 'Weeks' | 'Working Days';
  };
}

export interface TableGenerationSettings {
  mode: 'fixed' | 'per_parent';
  fixedCount: number;
  minPerParent?: number;
  maxPerParent?: number;
  drivingParentTableId?: string;
}

export interface Actor {
  id: string;
  name: string;
  description?: string;
}

export interface TablePermission {
  actorId: string;
  canCreate: boolean;
  canModify: boolean;
  canDelete: boolean;
  canView: boolean;
}

export type TableType = 'Object' | 'Relationship';

export interface Column {
  id: string;
  name: string;
  displayName?: string;
  systemName?: string;
  type: DataType;
  sampleValues: string[];
  rule: GenerationRule;
  revisionSchema?: string;
  description?: string; 
  isPrimaryKey?: boolean;
}

export interface Table {
  id: string;
  name: string;
  columns: Column[];
  rowCount: number;
  genSettings?: TableGenerationSettings;
  tableType?: TableType;
  description?: string;
  permissions?: TablePermission[];
  lifecyclePolicyId?: string;
  generationPriority?: number;
  ui?: {
    x: number;
    y: number;
    width: number;
    height: number;
    scrollPos?: number;
    isVisible?: boolean;
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

export interface GlobalSettings {
  startDate?: string;
  endDate?: string;
  preset?: 'Last 3 Years' | 'Current Year' | 'Next Year' | 'Custom';
  dynamicNow?: boolean;
}

export interface LifecycleState {
  id: string;
  name: string;
  sequence: number;
  minDurationDays: number;
  maxDurationDays: number;
}

export interface LifecyclePolicy {
  id: string;
  name: string;
  states: LifecycleState[];
}

export interface ProjectState {
  tables: Table[];
  relationships: Relationship[];
  referenceFiles: ReferenceFile[];
  actors: Actor[];
  policies?: LifecyclePolicy[];
  globalSettings?: GlobalSettings;
  canvasScroll?: { x: number; y: number };
  globalStartDate?: string;
  globalEndDate?: string;
}

export interface Project {
  id: string;
  name: string;
  lastModified: number;
  state: ProjectState;
  currentStep: number;
}