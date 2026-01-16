import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import { 
  Table, 
  Relationship, 
  GenerationStrategyType, 
  DataType, 
  Column, 
  ReferenceFile, 
  DateLogicConfig, 
  LifecyclePolicy 
} from '../src/types';
import { generateSyntheticDataBatch } from './geminiService';

/**
 * --- TYPES & INTERFACES ---
 * Used to maintain state during the recursive generation process.
 */
interface ThreadContext {
  anchors: Record<string, string>;
  registry: Record<string, number[]>; // Maps TableID -> Array of Row Indices generated in this thread
}

interface TableDataStore {
  [tableId: string]: {
    [columnId: string]: string[]; // The actual generated CSV data
  };
}

/**
 * --- HELPER FUNCTIONS ---
 * Basic utilities for randomizing data.
 */
const getRandom = <T,>(arr: T[]): T => {
  if (!arr || arr.length === 0) return undefined as any;
  return arr[Math.floor(Math.random() * arr.length)];
};

const getRandomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const generateRandomHex = (length: number): string => {
  let result = '';
  const characters = '0123456789ABCDEF';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * 16));
  }
  return result;
};

/**
 * Handles ID generation patterns like "ID-####" or "HEX-32"
 */
const generateId = (pattern: string, index: number): string => {
  if (pattern === 'UUID') return crypto.randomUUID();
  if (pattern.startsWith('HEX-')) {
    const len = parseInt(pattern.split('-')[1]) || 32;
    return generateRandomHex(len);
  }
  const hashCount = (pattern.match(/#/g) || []).length;
  if (hashCount === 0) return `${pattern}${index}`;
  return pattern.replace(/#+/g, (match) => index.toString().padStart(match.length, '0'));
};

/**
 * Formats dates according to the user's selected global format.
 * Default is Short Date (YYYY-MM-DD) per user preference.
 */
const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
  try {
    if (isNaN(date.getTime())) return "INVALID_DATE";
    switch (format) {
      case 'YYYY-MM-DD': 
        return date.toISOString().split('T')[0];
      case 'MM/DD/YYYY': 
        return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
      case 'DD/MM/YYYY': 
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
      case 'M/D/YYYY': 
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
      case 'Long': 
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      default: 
        return date.toISOString();
    }
  } catch (e) {
    console.error("Date formatting error:", e);
    return date.toISOString();
  }
};

const generateRandomDate = (startYear = 2020, endYear = 2030): Date => {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
};

/**
 * Logic for calculating relative dates (e.g., "3 days after TableA.CreatedDate")
 */
const resolveDate = (
  config: DateLogicConfig | undefined, 
  currentTableId: string, 
  rowIdx: number, 
  tableData: Record<string, string[]>, 
  globalStore: TableDataStore, 
  format: string, 
  threadContext: ThreadContext
): string => {
  if (!config) return formatDate(generateRandomDate(), format);

  const getVal = (tableId?: string, colId?: string): string | undefined => {
    if (!colId) return undefined;
    const tId = tableId || currentTableId;
    
    // Check if the data exists in the current row
    if (tId === currentTableId) return tableData[colId][rowIdx];
    
    // Check if we have a parent/thread relationship
    const threadIndices = threadContext.registry[tId];
    if (threadIndices && threadIndices.length > 0) {
      const parentTableData = globalStore[tId];
      const targetIdx = threadIndices[threadIndices.length - 1]; // Use most recent parent
      return parentTableData[colId][targetIdx];
    }
    
    // Fallback: Random record from global store
    const globalData = globalStore[tId];
    if (globalData && globalData[colId]?.length > 0) {
       return getRandom(globalData[colId]);
    }
    return undefined;
  };

  let baseTime = config.mode === 'Now' ? Date.now() : new Date(getVal(config.refTable1, config.refCol1) || Date.now()).getTime();
  
  if (config.mode === 'Between') {
    const end = new Date(getVal(config.refTable2, config.refCol2) || Date.now()).getTime();
    const min = Math.min(baseTime, end);
    const max = Math.max(baseTime, end);
    return formatDate(new Date(min + Math.random() * (max - min)), format);
  }

  const offset = getRandomInt(config.minOffset || 0, config.maxOffset || 0) * 86400000;
  const finalTime = config.operator?.includes('After') ? baseTime + offset : baseTime - offset;
  return formatDate(new Date(finalTime), format);
};

/**
 * --- TOPOLOGICAL SORT ---
 * Sorts tables so that parents are generated before children.
 */
const sortTablesByDependency = (tables: Table[], allTables: Table[]): Table[] => {
  const sorted: Table[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (table: Table) => {
    if (visited.has(table.id)) return;
    if (visiting.has(table.id)) {
      console.warn("Circular dependency detected in table:", table.name);
      return;
    }

    visiting.add(table.id);
    const depTableIds = new Set<string>();

    table.columns.forEach(col => {
      const config = col.rule.config;
      if (col.rule.type === GenerationStrategyType.LINKED || col.rule.type === GenerationStrategyType.RANDOM_RECORD) {
        if (config?.linkedTableId) depTableIds.add(config.linkedTableId);
        if (config?.linkedSources) config.linkedSources.forEach(s => depTableIds.add(s.tableId));
      }
      if (col.rule.type === GenerationStrategyType.DATE && config?.dateLogic) {
         if (config.dateLogic.refTable1) depTableIds.add(config.dateLogic.refTable1);
         if (config.dateLogic.refTable2) depTableIds.add(config.dateLogic.refTable2);
      }
    });

    depTableIds.forEach(depId => {
      const depTable = allTables.find(t => t.id === depId);
      if (depTable && depId !== table.id) visit(depTable);
    });

    visiting.delete(table.id);
    visited.add(table.id);
    sorted.push(table);
  };

  tables.forEach(t => visit(t));
  return sorted;
};

/**
 * --- CORE GENERATION ENGINE ---
 * Generates a single row for a specific table.
 */
const generateRow = (
  table: Table,
  threadContext: ThreadContext,
  globalStore: TableDataStore,
  relationships: Relationship[],
  referenceFiles: ReferenceFile[],
  globalDateFormat: string,
  allTables: Table[],
  policies: LifecyclePolicy[],
  drivingParentIdx?: number
): number => {
  const tableData = globalStore[table.id];
  const rowIdx = tableData[table.columns[0].id].length;
  const newRow: Record<string, string> = {};

  // 1. LIFECYCLE STATE LOGIC
  // If a table is bound to a lifecycle policy, we generate state dates first.
  if (table.lifecyclePolicyId) {
    const policy = (policies || []).find(p => p.id === table.lifecyclePolicyId);
    if (policy && policy.states) {
      const sortedStates = [...policy.states].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      let floorDate = new Date('2026-01-15'); // Current system date as base
      
      // Determine if there is a parent start date to respect
      Object.entries(threadContext.registry).forEach(([pTableId, indices]) => {
        const parentData = globalStore[pTableId];
        const lastIdx = indices[indices.length - 1];
        const parentMeta = allTables.find(t => t.id === pTableId);
        Object.keys(parentData).forEach(colId => {
          const colMeta = parentMeta?.columns.find(c => c.id === colId);
          if (colMeta?.name === 'originated' || colMeta?.name?.endsWith('.start')) {
            const val = parentData[colId][lastIdx];
            if (val) {
              const d = new Date(val);
              if (!isNaN(d.getTime()) && d > floorDate) floorDate = d;
            }
          }
        });
      });

      let currentPointer = new Date(floorDate.getTime() + (Math.random() * 120 * 60000));
      sortedStates.forEach(state => {
        const dur = getRandomInt(state.minDurationDays, state.maxDurationDays);
        const sStart = new Date(currentPointer);
        const sEnd = new Date(currentPointer);
        sEnd.setDate(sEnd.getDate() + dur);
        
        const startCol = table.columns.find(c => c.name === `state[${state.name}].start`);
        if (startCol) newRow[startCol.id] = formatDate(sStart, globalDateFormat);
        const endCol = table.columns.find(c => c.name === `state[${state.name}].end`);
        if (endCol) newRow[endCol.id] = formatDate(sEnd, globalDateFormat);
        
        currentPointer = new Date(sEnd.getTime() + 60000); // 1 minute gap
      });
    }
  }

  // 2. POLYMORPHIC LINKING & COLUMN GENERATION
  const linkDecisions: Record<string, { tableId: string, pIdx: number }> = {};

  for (const col of table.columns) {
    if (newRow[col.id] !== undefined) continue; // Skip if already handled by lifecycle
    const cfg = col.rule.config;

    if (col.rule.type === GenerationStrategyType.LINKED) {
      // Determine link sources
      interface LinkCandidate { tableId: string; colId?: string; }
      const candidates: LinkCandidate[] = [];
      if (cfg?.linkedSources) {
        candidates.push(...cfg.linkedSources.map(s => ({ tableId: s.tableId, colId: s.columnId })));
      }
      if (cfg?.linkedTableId && !candidates.some(c => c.tableId === cfg.linkedTableId)) {
        candidates.push({ tableId: cfg.linkedTableId, colId: cfg.linkedColumnId });
      }

      const candidateKey = JSON.stringify(candidates.map(c => c.tableId).sort());
      let selectedTableId: string | undefined;
      let selectedPIdx: number | undefined;
      let selectedColId: string | undefined;

      // Ensure consistency across columns (if multiple cols link to the same set of tables)
      if (linkDecisions[candidateKey]) {
        const decision = linkDecisions[candidateKey];
        selectedTableId = decision.tableId;
        selectedPIdx = decision.pIdx;
        selectedColId = candidates.find(c => c.tableId === selectedTableId)?.colId;
      }

      if (!selectedTableId && candidates.length > 0) {
        // Priority 1: Driving Parent
        let selCand = candidates.find(c => c.tableId === table.genSettings?.drivingParentTableId);
        if (selCand && drivingParentIdx !== undefined) {
           selectedPIdx = drivingParentIdx;
           selectedTableId = selCand.tableId;
           selectedColId = selCand.colId;
        } else {
           // Priority 2: Current Thread Context
           const regCand = candidates.filter(c => (threadContext.registry[c.tableId] || []).length > 0);
           if (regCand.length > 0) {
             const sel = getRandom(regCand);
             selectedTableId = sel.tableId;
             selectedPIdx = getRandom(threadContext.registry[selectedTableId]);
             selectedColId = sel.colId;
           } else {
             // Priority 3: Global Random
             const valid = candidates.filter(c => globalStore[c.tableId] && Object.values(globalStore[c.tableId])[0]?.length > 0);
             if (valid.length > 0) {
               const sel = getRandom(valid);
               selectedTableId = sel.tableId;
               selectedPIdx = getRandomInt(0, Object.values(globalStore[selectedTableId])[0].length - 1);
               selectedColId = sel.colId;
             }
           }
        }
        if (selectedTableId && selectedPIdx !== undefined) {
          linkDecisions[candidateKey] = { tableId: selectedTableId, pIdx: selectedPIdx };
        }
      }

      if (selectedTableId && selectedPIdx !== undefined) {
        const sourceData = globalStore[selectedTableId];
        const finalColId = selectedColId || Object.keys(sourceData)[0];
        newRow[col.id] = sourceData[finalColId][selectedPIdx] || "LINK_ERROR";
      } else {
        newRow[col.id] = "NOT_FOUND";
      }
      continue;
    }

    // Standard strategies
    let val = "";
    switch (col.rule.type) {
      case GenerationStrategyType.PATTERN: 
        val = generateId(cfg?.pattern || "ID-#", rowIdx + 1); 
        break;
      case GenerationStrategyType.DATE: 
        val = resolveDate(cfg?.dateLogic, table.id, rowIdx, tableData, globalStore, globalDateFormat, threadContext); 
        break;
      case GenerationStrategyType.REFERENCE:
        const ref = referenceFiles.find(rf => rf.id === cfg?.referenceFileId);
        val = ref ? getRandom(ref.values) : "REF_ERROR";
        break;
      case GenerationStrategyType.RANDOM:
        if (col.type === DataType.DATE) {
          val = formatDate(generateRandomDate(), globalDateFormat);
        } else {
          val = getRandom(cfg?.options || ["Value"]);
        }
        break;
      default: 
        val = col.sampleValues[0] || "Sample";
    }
    newRow[col.id] = val;
  }

  // Push to store
  for (const col of table.columns) {
    tableData[col.id].push(newRow[col.id]);
  }
  
  // Update thread registry
  if (!threadContext.registry[table.id]) threadContext.registry[table.id] = [];
  threadContext.registry[table.id].push(rowIdx);
  
  return rowIdx;
};

/**
 * --- RECURSION ENGINE ---
 * Automatically creates children for a generated parent.
 */
const generateRecursiveDescendants = (
  parentTable: Table, 
  parentIdx: number, 
  threadContext: ThreadContext, 
  allTables: Table[], 
  globalStore: TableDataStore, 
  relationships: Relationship[], 
  referenceFiles: ReferenceFile[], 
  globalDateFormat: string, 
  policies: LifecyclePolicy[]
) => {
  const childTables = allTables.filter(t => t.genSettings?.drivingParentTableId === parentTable.id);
  const sortedChildren = sortTablesByDependency(childTables, allTables);

  for (const childTable of sortedChildren) {
    const count = getRandomInt(childTable.genSettings?.minPerParent || 1, childTable.genSettings?.maxPerParent || 3);
    for (let i = 0; i < count; i++) {
      const idx = generateRow(
        childTable, 
        threadContext, 
        globalStore, 
        relationships, 
        referenceFiles, 
        globalDateFormat, 
        allTables, 
        policies, 
        parentIdx
      );
      // Recurse deeper
      generateRecursiveDescendants(childTable, idx, threadContext, allTables, globalStore, relationships, referenceFiles, globalDateFormat, policies);
    }
  }
};

/**
 * --- PUBLIC ENTRY POINT ---
 * Orchestrates the entire generation process.
 */
export const generateAndDownload = async (
  tables: Table[], 
  relationships: Relationship[], 
  referenceFiles: ReferenceFile[], 
  globalDateFormat: string, 
  onProgress: (msg: string) => void, 
  policies: LifecyclePolicy[] = []
) => {
  const zip = new JSZip();
  const globalStore: TableDataStore = {};
  
  // Initialize store
  tables.forEach(t => {
    globalStore[t.id] = {};
    t.columns.forEach(c => {
      globalStore[t.id][c.id] = [];
    });
  });

  onProgress("Building dependency graph...");
  const roots = sortTablesByDependency(tables.filter(t => !t.genSettings || t.genSettings.mode === 'fixed'), tables);
  
  // Generate Roots and their Descendants
  for (const rootTable of roots) {
    onProgress(`Generating ${rootTable.name} and children...`);
    const count = rootTable.genSettings?.fixedCount ?? 10;
    for (let i = 0; i < count; i++) {
      const threadContext: ThreadContext = { anchors: {}, registry: {} };
      const idx = generateRow(rootTable, threadContext, globalStore, relationships, referenceFiles, globalDateFormat, tables, policies);
      generateRecursiveDescendants(rootTable, idx, threadContext, tables, globalStore, relationships, referenceFiles, globalDateFormat, policies);
    }
  }

  // AI Refinement Phase
  for (const table of tables) {
    const aiCols = table.columns.filter(c => c.rule.type === GenerationStrategyType.AI);
    for (const col of aiCols) {
      onProgress(`AI Refining ${table.name}.${col.name}...`);
      const rowCount = globalStore[table.id][table.columns[0].id].length;
      if (rowCount === 0) continue;
      
      const ctxStrings = [];
      const depIds = col.rule.config?.dependentColumnIds || [];
      for (let r = 0; r < rowCount; r++) {
        const ctx = depIds.map(dId => {
          const cName = table.columns.find(c => c.id === dId)?.name;
          return `${cName}: ${globalStore[table.id][dId][r]}`;
        }).join(', ');
        ctxStrings.push(`[${ctx}]`);
      }
      
      globalStore[table.id][col.id] = await generateSyntheticDataBatch(
        col.rule.config?.aiPrompt || "Generate a realistic value", 
        rowCount, 
        col.sampleValues, 
        ctxStrings
      );
    }
  }

  // ZIP Creation
  onProgress("Finalizing CSV files...");
  for (const table of tables) {
    const header = table.columns.map(c => `"${c.name}"`).join(",");
    const rows = (globalStore[table.id][table.columns[0].id] || []).map((_, i) => {
      return table.columns.map(c => {
        const val = (globalStore[table.id][c.id][i] || "").toString();
        return `"${val.replace(/"/g, '""')}"`;
      }).join(",");
    });
    zip.file(`${table.name}.csv`, [header, ...rows].join("\n"));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const saveAsFunc = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  saveAsFunc(blob, "data_export.zip");
  onProgress("Done!");
};
