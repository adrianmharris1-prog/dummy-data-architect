import React, { useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { 
  Upload, Table as TableIcon, Network, Settings, Download, 
  Plus, X, ChevronRight, FileSpreadsheet, Wand2, Database,
  ArrowRight
} from 'lucide-react';
import { Table, Column, Relationship, DataType, GenerationStrategyType, GenerationRule } from './types';
import { generateAndDownload } from './services/generatorService';

// --- Sub-components defined here to keep file count low while maintaining modularity ---

// 1. Navbar
const Navbar = ({ step }: { step: number }) => (
  <div className="h-16 border-b bg-white flex items-center px-6 justify-between sticky top-0 z-50">
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">
        SF
      </div>
      <h1 className="font-semibold text-lg text-slate-800">Synthetic Forge</h1>
    </div>
    <div className="flex items-center gap-4 text-sm">
      {[
        { icon: Upload, label: 'Upload' },
        { icon: TableIcon, label: 'Schema' },
        { icon: Network, label: 'Relations' },
        { icon: Settings, label: 'Rules' },
        { icon: Download, label: 'Export' }
      ].map((item, idx) => (
        <div key={item.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${step === idx + 1 ? 'bg-primary/10 text-primary font-medium' : 'text-slate-500'}`}>
          <item.icon size={16} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  </div>
);

// 2. Upload Step
const FileUploadStep = ({ onFilesUploaded }: { onFilesUploaded: (tables: Table[]) => void }) => {
  const [isDragging, setIsDragging] = useState(false);

  // --- Intelligence Logic ---
  const detectColumnConfig = (name: string, samples: string[]): { type: DataType, isMultiValue: boolean, rule: GenerationRule } => {
    const lowerName = name.toLowerCase();
    const cleanSamples = samples.filter(s => s && s.trim() !== '');
    const firstSample = cleanSamples[0] || '';

    // 1. Detect Multi-value (Delimiters)
    let isMultiValue = false;
    let delimiter = '';
    if (cleanSamples.some(s => s.includes('|'))) {
      isMultiValue = true;
      delimiter = '|';
    } else if (cleanSamples.some(s => s.includes(',') && !s.includes(' '))) {
      // Simple heuristic: commas without spaces likely list items, with spaces might be text
      isMultiValue = true;
      delimiter = ',';
    }

    // 2. Detect ID Patterns
    if (lowerName === 'id' || lowerName === 'physicalid' || lowerName.endsWith('_id')) {
      let pattern = 'ID-####';
      // Check for Hex
      const hexMatch = firstSample.match(/^[0-9a-fA-F]+$/);
      if (hexMatch && firstSample.length > 8) {
        pattern = `HEX-${firstSample.length}`;
      } else if (firstSample.match(/^[0-9a-fA-F-]{36}$/)) {
        pattern = 'UUID';
      } else {
        // Check for prefix
        const prefixMatch = firstSample.match(/^([A-Za-z]+)-?(\d+)$/);
        if (prefixMatch) {
          pattern = `${prefixMatch[1]}-####`;
        }
      }
      return { 
        type: DataType.STRING, 
        isMultiValue: false, 
        rule: { type: GenerationStrategyType.PATTERN, config: { pattern } } 
      };
    }

    // 3. Detect Dates
    if (lowerName.includes('date') || lowerName.includes('time') || lowerName === 'created' || lowerName === 'modified') {
      return { 
        type: DataType.DATE, 
        isMultiValue: false, 
        rule: { type: GenerationStrategyType.RANDOM, config: { options: [] } } // Generator handles date logic automatically based on name
      };
    }

    // 4. Detect Categorical / Dropdowns (Metadata Rules)
    const categoricalNames = ['type', 'project', 'organization', 'department', 'status', 'category', 'priority'];
    if (categoricalNames.some(n => lowerName.includes(n))) {
      // Extract unique options
      const allValues = isMultiValue 
        ? cleanSamples.flatMap(s => s.split(delimiter)) 
        : cleanSamples;
      const uniqueOptions = Array.from(new Set(allValues.map(s => s.trim()))).slice(0, 50); // Limit to 50 options
      
      return {
        type: DataType.DROPDOWN,
        isMultiValue,
        rule: { 
          type: GenerationStrategyType.RANDOM, 
          config: { options: uniqueOptions, delimiter } 
        }
      };
    }

    // 5. Detect Numbers
    if (cleanSamples.every(s => !isNaN(Number(s)))) {
      return {
        type: DataType.NUMBER,
        isMultiValue: false,
        rule: { type: GenerationStrategyType.RANDOM, config: { options: cleanSamples.slice(0, 10) } } // Default to picking from sample for numbers for now
      };
    }

    // Default
    return {
      type: DataType.STRING,
      isMultiValue,
      rule: { type: GenerationStrategyType.COPY, config: { delimiter } }
    };
  };

  const processFile = (file: File): Promise<Table> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        preview: 50, // Analyze up to 50 rows for better detection
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          
          const columns: Column[] = headers.map((h, idx) => {
            const samples = rows.map(r => r[h]).filter(Boolean);
            const detected = detectColumnConfig(h, samples);
            
            return {
              id: `${file.name}-${h}-${idx}`,
              name: h,
              type: detected.type,
              isMultiValue: detected.isMultiValue,
              sampleValues: samples,
              rule: detected.rule
            };
          });

          resolve({
            id: `tbl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
            columns,
            rowCount: 0 
          });
        }
      });
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type === 'text/csv' || f.name.endsWith('.csv'));
    const tables = await Promise.all(files.map(processFile));
    onFilesUploaded(tables);
  };

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      const tables = await Promise.all(files.map(processFile));
      onFilesUploaded(tables);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
      <div 
        className={`w-full max-w-2xl h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-slate-300 bg-white'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
          <Upload size={32} />
        </div>
        <h3 className="text-xl font-medium text-slate-800 mb-2">Upload your Data Files</h3>
        <p className="text-slate-500 mb-6">Drag & drop CSV files here, or click to browse</p>
        <input 
          type="file" 
          multiple 
          accept=".csv" 
          className="hidden" 
          id="file-input"
          onChange={handleInput}
        />
        <label 
          htmlFor="file-input" 
          className="px-6 py-2.5 bg-primary hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer transition-colors"
        >
          Browse Files
        </label>
      </div>
      <p className="mt-8 text-sm text-slate-400">Supported formats: CSV (Excel support coming soon)</p>
    </div>
  );
};

// 3. Schema Step
const SchemaStep = ({ tables, onUpdateTable }: { tables: Table[], onUpdateTable: (t: Table) => void }) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id);
  const activeTable = tables.find(t => t.id === selectedTableId);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-2 overflow-y-auto">
        <h3 className="font-medium text-slate-500 text-sm uppercase tracking-wider mb-2">Tables</h3>
        {tables.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedTableId(t.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selectedTableId === t.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            <FileSpreadsheet size={18} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
        {activeTable && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-800">{activeTable.name} Schema</h2>
              <span className="text-sm text-slate-400">{activeTable.columns.length} columns detected</span>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Column Name</th>
                  <th className="px-6 py-3">Data Type</th>
                  <th className="px-6 py-3 text-center">Multi-value</th>
                  <th className="px-6 py-3">Sample Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTable.columns.map((col, idx) => (
                  <tr key={col.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-700">{col.name}</td>
                    <td className="px-6 py-3">
                      <select 
                        value={col.type}
                        onChange={(e) => {
                          const newCols = [...activeTable.columns];
                          newCols[idx] = { ...col, type: e.target.value as DataType };
                          onUpdateTable({ ...activeTable, columns: newCols });
                        }}
                        className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md focus:ring-primary focus:border-primary block w-32 p-1.5"
                      >
                        {Object.values(DataType).map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <input 
                        type="checkbox" 
                        checked={col.isMultiValue}
                        onChange={(e) => {
                          const newCols = [...activeTable.columns];
                          newCols[idx] = { ...col, isMultiValue: e.target.checked };
                          onUpdateTable({ ...activeTable, columns: newCols });
                        }}
                        className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary"
                      />
                    </td>
                    <td className="px-6 py-3 text-slate-400 italic truncate max-w-xs">
                      {col.sampleValues.slice(0, 3).join(', ')}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// 4. Visual Relationship Mapper
const RelationshipMapper = ({ 
  tables, 
  relationships, 
  onAddRelationship, 
  onRemoveRelationship 
}: { 
  tables: Table[], 
  relationships: Relationship[], 
  onAddRelationship: (r: Relationship) => void,
  onRemoveRelationship: (id: string) => void
}) => {
  const [dragSource, setDragSource] = useState<{ tableId: string, colId: string, x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleDragStart = (e: React.MouseEvent, tableId: string, colId: string) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    // Adjust for scroll of container if needed, but for now we use client fixed
    setDragSource({ tableId, colId, x: rect.right, y: rect.top + rect.height / 2 });
  };

  const handleDrop = (e: React.MouseEvent, targetTableId: string, targetColId: string) => {
    e.stopPropagation();
    if (dragSource && dragSource.tableId !== targetTableId) {
      onAddRelationship({
        id: `rel-${Date.now()}`,
        sourceTableId: dragSource.tableId, // Parent
        sourceColumnId: dragSource.colId,
        targetTableId: targetTableId, // Child
        targetColumnId: targetColId
      });
    }
    setDragSource(null);
  };

  return (
    <div className="flex-1 bg-slate-100 relative overflow-auto" style={{ cursor: dragSource ? 'grabbing' : 'default' }}>
      {/* SVG Layer for Lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
        {relationships.map(rel => {
           return null; // Simplified: No physical lines drawn in React, relies on badges
        })}
        {/* Draw temporary drag line */}
        {dragSource && (
          <line 
            x1={dragSource.x} 
            y1={dragSource.y} 
            x2={mousePos.x} 
            y2={mousePos.y} 
            stroke="#2563eb" 
            strokeWidth="2" 
            strokeDasharray="5,5" 
          />
        )}
      </svg>
      
      <div className="p-8 min-w-[1200px] min-h-[800px] relative">
        <h3 className="mb-4 text-slate-500 font-medium">Drag from a Source column (e.g. Person Name) to a Target column (e.g. Owner) to enforce integrity.</h3>
        
        <div className="grid grid-cols-3 gap-12">
          {tables.map((table) => (
            <div 
              key={table.id}
              ref={el => tableRefs.current[table.id] = el}
              className="bg-white rounded-lg shadow-md border border-slate-200 w-80 flex flex-col z-20"
            >
              <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-700 flex justify-between">
                {table.name}
                <Database size={16} className="text-slate-400"/>
              </div>
              <div className="p-2 flex-1 flex flex-col gap-1">
                {table.columns.map(col => {
                  const isSource = relationships.some(r => r.sourceColumnId === col.id);
                  const isTarget = relationships.some(r => r.targetColumnId === col.id);
                  
                  return (
                    <div 
                      key={col.id}
                      className={`group flex items-center justify-between p-2 rounded text-sm hover:bg-slate-50 transition-colors ${isSource ? 'bg-blue-50' : ''} ${isTarget ? 'bg-purple-50' : ''}`}
                    >
                      <span className="flex items-center gap-2 text-slate-700">
                        {isSource && <ArrowRight size={12} className="text-blue-500"/>}
                        {isTarget && <ArrowRight size={12} className="text-purple-500 rotate-180"/>}
                        {col.name}
                      </span>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {/* Connection Point */}
                        <div 
                          className="w-4 h-4 rounded-full bg-slate-300 hover:bg-primary cursor-grab border-2 border-white shadow-sm"
                          onMouseDown={(e) => handleDragStart(e, table.id, col.id)}
                          onMouseUp={(e) => handleDrop(e, table.id, col.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Existing Relationships List */}
        <div className="fixed bottom-8 right-8 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-30">
          <h4 className="font-semibold text-slate-800 mb-3 text-sm">Active Relationships</h4>
          {relationships.length === 0 && <p className="text-xs text-slate-400">No links defined.</p>}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {relationships.map(rel => {
               const srcT = tables.find(t => t.id === rel.sourceTableId);
               const tgtT = tables.find(t => t.id === rel.targetTableId);
               const srcC = srcT?.columns.find(c => c.id === rel.sourceColumnId);
               const tgtC = tgtT?.columns.find(c => c.id === rel.targetColumnId);
               return (
                 <div key={rel.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded border border-slate-100">
                    <div className="flex flex-col">
                      <span className="text-blue-600 font-medium">{srcT?.name}.{srcC?.name}</span>
                      <span className="text-slate-400 rotate-90 w-3 h-3 flex items-center justify-center">↓</span>
                      <span className="text-purple-600 font-medium">{tgtT?.name}.{tgtC?.name}</span>
                    </div>
                    <button onClick={() => onRemoveRelationship(rel.id)} className="text-slate-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                 </div>
               );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. Rules Configuration
const RulesConfig = ({ tables, relationships, onUpdateColumn }: { tables: Table[], relationships: Relationship[], onUpdateColumn: (tId: string, col: Column) => void }) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id);
  const activeTable = tables.find(t => t.id === selectedTableId);
  const [editingColId, setEditingColId] = useState<string | null>(null);

  // Helper to check if col is a FK (target of a relationship)
  const isFK = (colId: string) => relationships.some(r => r.targetColumnId === colId);

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      <div className="w-64 bg-white border-r border-slate-200 p-4 overflow-y-auto">
         {tables.map(t => (
          <button
            key={t.id}
            onClick={() => { setSelectedTableId(t.id); setEditingColId(null); }}
            className={`w-full flex items-center gap-3 px-3 py-2 mb-1 rounded-lg text-left transition-colors ${selectedTableId === t.id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        <h2 className="text-xl font-semibold text-slate-800 mb-6">Generation Rules: {activeTable?.name}</h2>
        <div className="space-y-4">
          {activeTable?.columns.map(col => {
            const isForeignKey = isFK(col.id);
            const isEditing = editingColId === col.id;
            const isMulti = col.isMultiValue;

            return (
              <div key={col.id} className={`bg-white rounded-lg border ${isEditing ? 'border-primary ring-1 ring-primary' : 'border-slate-200'} p-4 shadow-sm transition-all`}>
                <div className="flex items-center justify-between mb-3">
                   <div className="flex items-center gap-3">
                     <span className="font-semibold text-slate-700 w-48 truncate" title={col.name}>{col.name}</span>
                     
                     {/* Tags */}
                     {isForeignKey && (
                       <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">Linked</span>
                     )}
                     {isMulti && (
                       <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">Multi-Value</span>
                     )}
                     
                     {!isForeignKey && (
                       <span className={`px-2 py-0.5 rounded text-xs font-medium border ${col.rule.type === GenerationStrategyType.AI ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                         {col.rule.type}
                       </span>
                     )}
                   </div>
                   {!isForeignKey && (
                     <button 
                        onClick={() => setEditingColId(isEditing ? null : col.id)}
                        className="text-sm text-primary hover:underline font-medium"
                     >
                       {isEditing ? 'Done' : 'Edit Strategy'}
                     </button>
                   )}
                </div>

                {/* Detected Patterns Display */}
                {col.rule.type === GenerationStrategyType.PATTERN && (
                  <div className="text-xs text-slate-400 mb-2">
                    Detected Pattern: <span className="font-mono bg-slate-100 px-1 rounded">{col.rule.config?.pattern}</span>
                  </div>
                )}
                 {col.rule.type === GenerationStrategyType.RANDOM && col.rule.config?.options && (
                  <div className="text-xs text-slate-400 mb-2 truncate">
                    Options: {col.rule.config.options.length} detected (e.g. {col.rule.config.options.slice(0, 3).join(', ')}...)
                  </div>
                )}

                {isEditing && !isForeignKey && (
                  <div className="bg-slate-50 rounded p-4 mt-2 grid grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Strategy</label>
                      <select 
                        value={col.rule.type}
                        onChange={(e) => {
                           const type = e.target.value as GenerationStrategyType;
                           onUpdateColumn(activeTable.id, { 
                             ...col, 
                             rule: { ...col.rule, type } 
                           });
                        }}
                        className="w-full rounded border-slate-300 text-sm focus:ring-primary focus:border-primary"
                      >
                        {Object.values(GenerationStrategyType).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col justify-end space-y-4">
                      {col.rule.type === GenerationStrategyType.PATTERN && (
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Pattern (Use # for digits, or HEX-32)</label>
                          <input 
                            type="text"
                            className="w-full rounded border-slate-300 text-sm focus:ring-primary focus:border-primary"
                            value={col.rule.config?.pattern || ''}
                            onChange={(e) => onUpdateColumn(activeTable.id, { ...col, rule: { ...col.rule, config: { ...col.rule.config, pattern: e.target.value } } })}
                          />
                        </div>
                      )}

                      {col.rule.type === GenerationStrategyType.RANDOM && (
                        <div>
                           <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Options (Comma separated)</label>
                           <input 
                            type="text"
                            className="w-full rounded border-slate-300 text-sm focus:ring-primary focus:border-primary"
                            placeholder="Red, Green, Blue"
                            value={col.rule.config?.options?.join(', ') || ''}
                            onChange={(e) => onUpdateColumn(activeTable.id, { ...col, rule: { ...col.rule, config: { ...col.rule.config, options: e.target.value.split(',').map(s => s.trim()) } } })}
                          />
                        </div>
                      )}
                      
                      {isMulti && (
                         <div>
                           <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Multi-value Delimiter</label>
                           <input 
                            type="text"
                            className="w-full rounded border-slate-300 text-sm focus:ring-primary focus:border-primary"
                            placeholder=", or |"
                            maxLength={1}
                            value={col.rule.config?.delimiter || ','}
                            onChange={(e) => onUpdateColumn(activeTable.id, { ...col, rule: { ...col.rule, config: { ...col.rule.config, delimiter: e.target.value } } })}
                          />
                        </div>
                      )}

                      {col.rule.type === GenerationStrategyType.AI && (
                        <div>
                           <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Gemini Prompt</label>
                           <div className="relative">
                            <Wand2 size={14} className="absolute left-3 top-3 text-amber-500" />
                            <textarea 
                              className="w-full rounded border-amber-300 text-sm pl-9 focus:ring-amber-500 focus:border-amber-500 bg-amber-50/50"
                              placeholder="e.g. Generate realistic aerospace defect descriptions"
                              rows={2}
                              value={col.rule.config?.aiPrompt || ''}
                              onChange={(e) => onUpdateColumn(activeTable.id, { ...col, rule: { ...col.rule, config: { ...col.rule.config, aiPrompt: e.target.value } } })}
                            />
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 6. Export Step
const ExportStep = ({ tables, relationships }: { tables: Table[], relationships: Relationship[] }) => {
  const [rowCount, setRowCount] = useState(100);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setProgress("Initializing...");
    try {
      await generateAndDownload(tables, relationships, rowCount, setProgress);
    } catch (e) {
      console.error(e);
      setProgress("Error occurred. Check console.");
    } finally {
      setTimeout(() => {
        setGenerating(false);
        setProgress("");
      }, 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Download size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to Forge</h2>
        <p className="text-slate-500 mb-8">Generate synthetic data based on your {tables.length} tables and {relationships.length} relationships.</p>
        
        <div className="mb-8 text-left">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Number of Rows per Table</label>
          <input 
            type="number" 
            min="1" 
            max="5000"
            value={rowCount}
            onChange={(e) => setRowCount(parseInt(e.target.value))}
            className="w-full rounded-lg border-slate-300 focus:ring-green-500 focus:border-green-500 text-lg"
          />
          <p className="text-xs text-slate-400 mt-2">Gemini AI generation may take longer for large datasets.</p>
        </div>

        {generating ? (
          <div className="w-full bg-slate-100 rounded-full h-12 flex items-center justify-center text-slate-600 font-medium animate-pulse border border-slate-200">
            {progress}
          </div>
        ) : (
           <button 
            onClick={handleGenerate}
            className="w-full py-3 px-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
          >
            Generate & Download Zip
          </button>
        )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [step, setStep] = useState(1);
  const [tables, setTables] = useState<Table[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  const handleUpdateTable = (updatedTable: Table) => {
    setTables(tables.map(t => t.id === updatedTable.id ? updatedTable : t));
  };

  const handleUpdateColumn = (tableId: string, updatedColumn: Column) => {
    setTables(tables.map(t => {
      if (t.id === tableId) {
        return {
          ...t,
          columns: t.columns.map(c => c.id === updatedColumn.id ? updatedColumn : c)
        };
      }
      return t;
    }));
  };

  return (
    <div className="h-full flex flex-col">
      <Navbar step={step} />
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {step === 1 && (
          <FileUploadStep onFilesUploaded={(newTables) => { setTables([...tables, ...newTables]); setStep(2); }} />
        )}
        {step === 2 && (
          <SchemaStep tables={tables} onUpdateTable={handleUpdateTable} />
        )}
        {step === 3 && (
          <RelationshipMapper 
            tables={tables} 
            relationships={relationships} 
            onAddRelationship={(r) => setRelationships([...relationships, r])}
            onRemoveRelationship={(id) => setRelationships(relationships.filter(r => r.id !== id))}
          />
        )}
        {step === 4 && (
          <RulesConfig tables={tables} relationships={relationships} onUpdateColumn={handleUpdateColumn} />
        )}
        {step === 5 && (
          <ExportStep tables={tables} relationships={relationships} />
        )}
      </main>

      {/* Navigation Footer */}
      <div className="h-16 bg-white border-t border-slate-200 flex items-center justify-between px-8">
        <button 
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-4 py-2 rounded text-slate-600 font-medium disabled:opacity-30 hover:bg-slate-50"
        >
          Back
        </button>
        
        {step < 5 ? (
          <button 
            onClick={() => setStep(Math.min(5, step + 1))}
            disabled={tables.length === 0}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next Step <ChevronRight size={18} />
          </button>
        ) : (
          <button 
            onClick={() => setStep(1)} 
            className="text-slate-500 hover:text-primary text-sm font-medium"
          >
            Start Over
          </button>
        )}
      </div>
    </div>
  );
}