import JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import { Table, Relationship, GenerationStrategyType, DataType, Column } from '../types';
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

  // Replace # with index (padded)
  const hashCount = (pattern.match(/#/g) || []).length;
  if (hashCount === 0) return `${pattern}${index}`;
  
  const paddedIndex = index.toString().padStart(hashCount, '0');
  // This is a simplistic replacement
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
      // Ensure start is valid and before end, else fallback to random recent
      if (isNaN(start) || start >= end) return now.toISOString();
      return new Date(start + Math.random() * (end - start)).toISOString();
   }
   return now.toISOString();
};

// Topological Sort to respect FK dependencies
const getGenerationOrder = (tables: Table[], relationships: Relationship[]): Table[] => {
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  tables.forEach(t => {
    adj.set(t.id, []);
    inDegree.set(t.id, 0);
  });

  relationships.forEach(rel => {
    // If Table B has a FK to Table A, Table A must be generated first.
    // So A -> B
    const parent = rel.targetTableId; 
    const child = rel.sourceTableId;
    
    // Avoid self-references causing cycles
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

  // If cycle detected, just add remaining
  if (order.length !== tables.length) {
      const remaining = tables.filter(t => !order.includes(t.id)).map(t => t.id);
      order.push(...remaining);
  }

  return order.map(id => tables.find(t => t.id === id)!);
};

export const generateAndDownload = async (
  tables: Table[],
  relationships: Relationship[],
  globalRowCount: number, // Ignored now, using table settings
  onProgress: (msg: string) => void
) => {
  const zip = new JSZip();
  const generatedDataStore: Record<string, Record<string, string[]>> = {}; // TableID -> ColID -> Array of values
  
  // 1. Determine Table Order
  const orderedTables = getGenerationOrder(tables, relationships);
  
  onProgress("Planning generation strategy...");

  for (const table of orderedTables) {
    onProgress(`Processing table: ${table.name}...`);
    const tableData: Record<string, string[]> = {};
    
    // Initialize columns
    for (const col of table.columns) {
      tableData[col.id] = [];
    }

    // Identify Foreign Keys for this table
    const fkMap = new Map<string, { parentTableId: string, parentColId: string }>();
    relationships.filter(r => r.sourceTableId === table.id).forEach(r => {
      fkMap.set(r.sourceColumnId, { parentTableId: r.targetTableId, parentColId: r.targetColumnId });
    });

    // DETERMINE TARGET ROWS and DRIVING PARENT
    let targetRows = 0;
    const settings = table.genSettings || { mode: 'fixed', fixedCount: 100 };
    const drivingParentId = settings.mode === 'per_parent' ? settings.drivingParentTableId : undefined;
    
    // Get driving parent IDs if per_parent mode
    let drivingParentIds: string[] = [];
    if (settings.mode === 'per_parent' && drivingParentId) {
       // Find the PK column of the parent (assumed linked via relationship)
       // Actually, we just need ANY valid ID from the parent's generated set.
       // Usually we look up the column used in the relationship.
       const rel = relationships.find(r => r.sourceTableId === table.id && r.targetTableId === drivingParentId);
       if (rel && generatedDataStore[drivingParentId]?.[rel.targetColumnId]) {
         drivingParentIds = generatedDataStore[drivingParentId][rel.targetColumnId];
       } else {
         // Fallback if relation not found (shouldn't happen if UI filters correctly) or parent has no data
         console.warn(`Driving parent data not found for ${table.name}`);
         settings.mode = 'fixed';
         settings.fixedCount = 10;
       }
    }

    // Determine Pre-calculated Row Count for AI Batching
    if (settings.mode === 'fixed') {
      targetRows = settings.fixedCount || 100;
    } else {
      // For per_parent, we estimate max needed (lazy approach: just generate batch by batch? No, AI needs batch)
      // Let's calculate exact total needed first
      targetRows = 0; // Will be derived during loop
    }
    
    // If per_parent, we need to construct the loop structure first to know total rows for AI prompt
    interface GenerationJob {
       drivingId?: string; // The ID of the parent if per_parent
       count: number;
    }
    const jobs: GenerationJob[] = [];

    if (settings.mode === 'per_parent') {
       drivingParentIds.forEach(pid => {
          const count = getRandomInt(settings.minPerParent ?? 1, settings.maxPerParent ?? 5);
          if (count > 0) {
            jobs.push({ drivingId: pid, count });
            targetRows += count;
          }
       });
    } else {
       jobs.push({ count: targetRows });
    }

    // 2. Pre-fetch AI content
    const aiColumns = table.columns.filter(c => c.rule.type === GenerationStrategyType.AI);
    const aiCache: Record<string, string[]> = {};
    
    if (targetRows > 0) {
      await Promise.all(aiColumns.map(async (col) => {
        onProgress(`Generating AI content for ${table.name}.${col.name} (${targetRows} items)...`);
        const prompt = col.rule.config?.aiPrompt || "Generate random values";
        // AI Batching: 5000 max? simple implementation
        aiCache[col.id] = await generateSyntheticDataBatch(prompt, targetRows, col.sampleValues);
      }));
    }

    // 3. Sort columns to ensure Dependencies (Dates) are handled correctly
    const sortedColumns = [...table.columns].sort((a, b) => {
       const aName = a.name.toLowerCase();
       const bName = b.name.toLowerCase();
       if (aName.includes('modified') || aName.includes('updated')) return 1;
       if (bName.includes('modified') || bName.includes('updated')) return -1;
       return 0;
    });

    // 4. Generate Rows
    let globalRowIndex = 0;

    for (const job of jobs) {
       for (let k = 0; k < job.count; k++) {
          for (const col of sortedColumns) {
            // Check if this column is the FK to the Driving Parent
            const fkInfo = fkMap.get(col.id);
            
            if (fkInfo) {
              // Is this the driving parent?
              if (settings.mode === 'per_parent' && fkInfo.parentTableId === drivingParentId) {
                 tableData[col.id].push(job.drivingId || "ERROR");
                 continue;
              }

              // Normal FK logic (Random assignment from other parents)
              const parentValues = generatedDataStore[fkInfo.parentTableId]?.[fkInfo.parentColId];
              if (parentValues && parentValues.length > 0) {
                tableData[col.id].push(getRandom(parentValues));
              } else {
                 tableData[col.id].push("ORPHAN"); 
              }
              continue;
            }

            // Special Date Logic (Time-Arrow)
            if (col.type === DataType.DATE) {
              const lowerName = col.name.toLowerCase();
              if (lowerName.includes('modified') || lowerName.includes('updated')) {
                const createdCol = table.columns.find(c => 
                  (c.name.toLowerCase().includes('created') || c.name.toLowerCase().includes('originated')) 
                  && tableData[c.id][tableData[c.id].length] // This index is tricky, we push to array. Length is current index
                );
                // Actually we just pushed to tableData[col.id], so index is length-1
                // Wait, we haven't pushed 'this' col yet.
                // We need the value from the createdCol at the SAME index.
                const currentIndex = tableData[col.id].length; 
                const createdVal = createdCol ? tableData[createdCol.id][currentIndex] : null;

                if (createdVal) {
                   tableData[col.id].push(generateDate('future', createdVal));
                } else {
                   tableData[col.id].push(generateDate('random'));
                }
              } else {
                tableData[col.id].push(generateDate('random'));
              }
              continue;
            }

            let val = "";
            switch (col.rule.type) {
              case GenerationStrategyType.COPY:
                val = col.sampleValues[globalRowIndex % col.sampleValues.length] || "";
                break;
              case GenerationStrategyType.PATTERN:
                val = generateId(col.rule.config?.pattern || "ID-#", globalRowIndex + 1);
                break;
              case GenerationStrategyType.RANDOM:
                const opts = col.rule.config?.options || ["A", "B", "C"];
                if (col.isMultiValue) {
                   const count = Math.floor(Math.random() * 3) + 1;
                   const selected = [];
                   for(let m=0; m<count; m++) selected.push(getRandom(opts));
                   const uniqueSelected = Array.from(new Set(selected));
                   val = uniqueSelected.join(col.rule.config?.delimiter || ',');
                } else {
                   val = getRandom(opts);
                }
                break;
              case GenerationStrategyType.AI:
                val = aiCache[col.id][globalRowIndex] || "";
                break;
              default:
                val = "";
            }
            tableData[col.id].push(val);
          }
          globalRowIndex++;
       }
    }

    generatedDataStore[table.id] = tableData;

    // Convert to CSV
    // Ensure we write columns in original order
    const csvHeader = table.columns.map(c => `"${c.name}"`).join(",");
    const finalRowCount = tableData[table.columns[0].id].length;
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