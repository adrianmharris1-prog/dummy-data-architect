
import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import { Table, Relationship, GenerationStrategyType, DataType, Column, ReferenceFile } from '../types';
import { generateSyntheticDataBatch } from './geminiService';

// --- Helper Functions ---

const generateRandomHex = (length: number) => {
  let result = '';
  const characters = '0123456789ABCDEF';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * 16));
  }
  return result;
};

const generateId = (pattern: string, index: number): string => {
  if (pattern === 'UUID') {
    return crypto.randomUUID();
  }
  if (pattern.startsWith('HEX-')) {
    const len = parseInt(pattern.split('-')[1]);
    return generateRandomHex(len || 32);
  }

  const hashCount = (pattern.match(/#/g) || []).length;
  if (hashCount === 0) return `${pattern}${index}`;
  
  return pattern.replace(/#+/g, (match) => {
     return index.toString().padStart(match.length, '0');
  });
};

const getRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateDate = (type: 'random' | 'future', referenceDateStr?: string) => {
   const now = new Date();
   const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);
   
   if (type === 'random') {
      return new Date(fiveYearsAgo.getTime() + Math.random() * (now.getTime() - fiveYearsAgo.getTime())).toISOString();
   }
   if (type === 'future' && referenceDateStr) {
      const start = new Date(referenceDateStr).getTime();
      const end = now.getTime();
      if (isNaN(start) || start >= end) return now.toISOString();
      return new Date(start + Math.random() * (end - start)).toISOString();
   }
   return now.toISOString();
};

const getGenerationOrder = (tables: Table[], relationships: Relationship[]): Table[] => {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  tables.forEach(t => {
    adj.set(t.id, []);
    inDegree.set(t.id, 0);
  });

  relationships.forEach(rel => {
    const parent = rel.targetTableId; 
    const child = rel.sourceTableId;
    if (parent !== child) {
        adj.get(parent)?.push(child);
        inDegree.set(child, (inDegree.get(child) || 0) + 1);
    }
  });

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    adj.get(u)?.forEach(v => {
      inDegree.set(v, (inDegree.get(v)! - 1));
      if (inDegree.get(v) === 0) queue.push(v);
    });
  }

  if (order.length !== tables.length) {
      const remaining = tables.filter(t => !order.includes(t.id)).map(t => t.id);
      order.push(...remaining);
  }

  return order.map(id => tables.find(t => t.id === id)!);
};

export const generateAndDownload = async (
  tables: Table[],
  relationships: Relationship[],
  referenceFiles: ReferenceFile[],
  onProgress: (msg: string) => void
) => {
  const zip = new JSZip();
  const generatedDataStore: Record<string, Record<string, string[]>> = {}; 
  
  const orderedTables = getGenerationOrder(tables, relationships);
  
  onProgress("Planning generation strategy...");

  for (const table of orderedTables) {
    onProgress(`Processing table: ${table.name}...`);
    const tableData: Record<string, string[]> = {};
    
    for (const col of table.columns) {
      tableData[col.id] = [];
    }

    let targetRows = 0;
    const settings = table.genSettings || { mode: 'fixed', fixedCount: 100 };
    const drivingParentId = settings.mode === 'per_parent' ? settings.drivingParentTableId : undefined;
    
    let drivingParentIds: string[] = [];
    if (settings.mode === 'per_parent' && drivingParentId) {
       // Find the specific relationship linking this table to its driving parent
       const rel = relationships.find(r => r.sourceTableId === table.id && r.targetTableId === drivingParentId);
       if (rel && generatedDataStore[drivingParentId]?.[rel.targetColumnId]) {
         drivingParentIds = generatedDataStore[drivingParentId][rel.targetColumnId];
       } else {
         const parentTableData = generatedDataStore[drivingParentId];
         if (parentTableData) {
            const firstCol = Object.keys(parentTableData)[0];
            if (firstCol) drivingParentIds = parentTableData[firstCol];
         }
       }
    }

    interface GenerationJob {
       drivingId?: string;
       parentRowIndex?: number;
       count: number;
    }
    const jobs: GenerationJob[] = [];

    if (settings.mode === 'per_parent' && drivingParentIds.length > 0) {
       drivingParentIds.forEach((pid, index) => {
          const count = getRandomInt(settings.minPerParent ?? 1, settings.maxPerParent ?? 5);
          if (count > 0) {
            jobs.push({ drivingId: pid, parentRowIndex: index, count });
            targetRows += count;
          }
       });
    } else {
       targetRows = settings.fixedCount || 100;
       jobs.push({ count: targetRows });
    }

    const aiColumns = table.columns.filter(c => c.rule.type === GenerationStrategyType.AI);
    const sortedAiColumns: Column[] = [];
    const visited = new Set<string>();

    const visit = (col: Column) => {
      if (visited.has(col.id)) return;
      const depIds = col.rule.config?.dependentColumnIds || [];
      depIds.forEach(depId => {
        const depCol = table.columns.find(c => c.id === depId);
        if (depCol && depCol.rule.type === GenerationStrategyType.AI) {
           visit(depCol);
        }
      });
      visited.add(col.id);
      sortedAiColumns.push(col);
    };

    aiColumns.forEach(visit);

    if (targetRows > 0) {
      const nonAiColumns = table.columns.filter(c => c.rule.type !== GenerationStrategyType.AI);
      
      for (const job of jobs) {
        for (let k = 0; k < job.count; k++) {
          const globalRowIdx = tableData[table.columns[0].id].length;
          
          const selectedParentIndices: Record<string, number> = {};
          
          if (settings.mode === 'per_parent' && drivingParentId !== undefined && job.parentRowIndex !== undefined) {
             selectedParentIndices[drivingParentId] = job.parentRowIndex;
          }

          const getSyncedParentIndex = (pId: string) => {
            if (selectedParentIndices[pId] !== undefined) return selectedParentIndices[pId];
            const pData = generatedDataStore[pId];
            if (!pData) return -1;
            const keys = Object.keys(pData);
            const len = keys.length > 0 ? pData[keys[0]]?.length || 0 : 0;
            const idx = len > 0 ? getRandomInt(0, len - 1) : -1;
            selectedParentIndices[pId] = idx;
            return idx;
          };

          for (const col of nonAiColumns) {
            if (col.type === DataType.DATE) {
              tableData[col.id].push(generateDate('random'));
              continue;
            }
            if (col.type === DataType.REVISION) {
              const schema = col.revisionSchema || "-, A, B, C";
              const options = schema.split(',').map(s => s.trim()).filter(Boolean);
              tableData[col.id].push(options.length ? getRandom(options) : "-");
              continue;
            }

            let val = "";
            switch (col.rule.type) {
              case GenerationStrategyType.COPY: 
                val = col.sampleValues[globalRowIdx % col.sampleValues.length] || ""; 
                break;
              case GenerationStrategyType.PATTERN: 
                val = generateId(col.rule.config?.pattern || "ID-#", globalRowIdx + 1); 
                break;
              case GenerationStrategyType.RANDOM:
                const opts = col.rule.config?.options || ["A", "B", "C"];
                val = col.isMultiValue ? Array.from(new Set([getRandom(opts), getRandom(opts)])).join(col.rule.config?.delimiter || ',') : getRandom(opts);
                break;
              case GenerationStrategyType.REFERENCE:
                const refId = col.rule.config?.referenceFileId;
                const refFile = referenceFiles.find(rf => rf.id === refId);
                if (refFile && refFile.values.length > 0) {
                  val = getRandom(refFile.values);
                } else {
                  val = "MISSING_REF";
                }
                break;
              case GenerationStrategyType.LINKED:
                const tTabId = col.rule.config?.linkedTableId || drivingParentId;
                const tColId = col.rule.config?.linkedColumnId;
                
                if (tTabId && tColId) {
                  const pIdx = getSyncedParentIndex(tTabId);
                  const sVals = generatedDataStore[tTabId]?.[tColId];
                  if (pIdx !== -1 && sVals && sVals[pIdx] !== undefined) {
                    val = sVals[pIdx];
                  } else {
                    val = "MISSING_SOURCE_VAL";
                  }
                } else {
                  val = "UNCONFIGURED_LINK";
                }
                break;
              default:
                val = col.sampleValues[0] || "";
            }
            tableData[col.id].push(val);
          }
        }
      }

      for (const col of sortedAiColumns) {
        onProgress(`Generating AI content for ${table.name}.${col.name}...`);
        const depIds = col.rule.config?.dependentColumnIds || [];
        
        // Build an array of multi-column context strings for each row
        const contextStrings: string[] = [];
        const numRows = tableData[table.columns[0].id].length;
        
        for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
          const rowContext = depIds.map(depId => {
            const depCol = table.columns.find(c => c.id === depId);
            const val = tableData[depId]?.[rowIdx] || "";
            return `${depCol?.name}: ${val}`;
          }).join(", ");
          contextStrings.push(rowContext ? `[${rowContext}]` : "");
        }
        
        const prompt = col.rule.config?.aiPrompt || "Generate random values";
        tableData[col.id] = await generateSyntheticDataBatch(prompt, targetRows, col.sampleValues, contextStrings);
      }
    }

    generatedDataStore[table.id] = tableData;

    const csvHeader = table.columns.map(c => `"${c.name}"`).join(",");
    const firstColId = table.columns[0]?.id;
    const finalRowCount = firstColId ? tableData[firstColId]?.length || 0 : 0;
    const csvRows = [];
    for (let i = 0; i < finalRowCount; i++) {
      const row = table.columns.map(c => `"${(generatedDataStore[table.id][c.id][i] || "").replace(/"/g, '""')}"`).join(",");
      csvRows.push(row);
    }
    const csvContent = [csvHeader, ...csvRows].join("\n");
    zip.file(`${table.name}.csv`, csvContent);
  }

  onProgress("Zipping files...");
  const saveAsFunc = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  const content = await zip.generateAsync({ type: "blob" });
  saveAsFunc(content, "synthetic_data.zip");
  onProgress("Done!");
};
