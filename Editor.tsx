import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Papa from 'papaparse';
import { 
  Upload, Table as TableIcon, Network, Settings, Download, 
  Plus, X, ChevronRight, ChevronLeft, FileSpreadsheet, Wand2, Database,
  ArrowRight, ArrowLeft, Save, GripHorizontal, Move, Maximize2, Trash2, Link,
  Users, Layers, Hash, Eye, EyeOff, PanelLeftClose, PanelLeftOpen,
  Sparkles, MessageSquare
} from 'lucide-react';
import { Table, Column, Relationship, DataType, GenerationStrategyType, GenerationRule, Project, Cardinality, TableGenerationSettings } from './types';
import { generateAndDownload } from './services/generatorService';

// --- Sub-components ---

// 1. Navbar
const Navbar = ({ 
  step, 
  projectName, 
  onBack, 
  onSave,
  onStepChange,
  canNavigate
}: { 
  step: number, 
  projectName: string, 
  onBack: () => void, 
  onSave: () => void,
  onStepChange: (step: number) => void,
  canNavigate: boolean
}) => {
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const handleSaveClick = () => {
    onSave();
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2000);
  };

  return (
    <div className="h-16 border-b bg-white flex items-center px-6 justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          title="Back to Projects"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex flex-col border-r border-slate-200 pr-6 mr-2">
          <h1 className="font-semibold text-sm text-slate-800">{projectName}</h1>
          <span className="text-xs text-slate-400">Editor Mode</span>
        </div>
        
        <button 
          onClick={handleSaveClick}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            saveState === 'saved' 
              ? 'bg-green-50 text-green-600 border border-green-200 shadow-sm' 
              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
          }`}
        >
          <Save size={16} />
          {saveState === 'saved' ? 'Saved' : 'Save'}
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {[
          { icon: Upload, label: 'Upload' },
          { icon: TableIcon, label: 'Schema' },
          { icon: Network, label: 'Relations' },
          { icon: Settings, label: 'Rules' },
          { icon: Download, label: 'Export' }
        ].map((item, idx) => {
          const targetStep = idx + 1;
          const isDisabled = !canNavigate && targetStep > 1;

          return (
            <button 
              key={item.label} 
              onClick={() => !isDisabled && onStepChange(targetStep)}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
                step === targetStep 
                  ? 'bg-primary/10 text-primary font-medium' 
                  : isDisabled 
                    ? 'text-slate-300 cursor-not-allowed' 
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer'
              }`}
            >
              <item.icon size={16} />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

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
      isMultiValue = true;
      delimiter = ',';
    }

    // 2. Detect ID Patterns
    if (lowerName === 'id' || lowerName === 'physicalid' || lowerName.endsWith('_id')) {
      let pattern = 'ID-####';
      const hexMatch = firstSample.match(/^[0-9a-fA-F]+$/);
      if (hexMatch && firstSample.length > 8) {
        pattern = `HEX-${firstSample.length}`;
      } else if (firstSample.match(/^[0-9a-fA-F-]{36}$/)) {
        pattern = 'UUID';
      } else {
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
        rule: { type: GenerationStrategyType.RANDOM, config: { options: [] } } 
      };
    }

    // 4. Detect Categorical / Dropdowns
    const categoricalNames = ['type', 'project', 'organization', 'department', 'status', 'category', 'priority'];
    if (categoricalNames.some(n => lowerName.includes(n))) {
      const allValues = isMultiValue 
        ? cleanSamples.flatMap(s => s.split(delimiter)) 
        : cleanSamples;
      const uniqueOptions = Array.from(new Set(allValues.map(s => s.trim()))).slice(0, 50); 
      
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
        rule: { type: GenerationStrategyType.RANDOM, config: { options: cleanSamples.slice(0, 10) } } 
      };
    }

    // Default
    return {
      type: DataType.STRING,
      isMultiValue,
      rule: { type: GenerationStrategyType.COPY, config: { delimiter } }
    };
  };

  const processFile = (file: File, index: number): Promise<Table> => {
    return new Promise((resolve) => {
      // Generate a unique table ID
      const tableId = `tbl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      Papa.parse(file, {
        header: true,
        preview: 50,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data as Record<string, string>[];
          
          const columns: Column[] = headers.map((h, idx) => {
            const samples = rows.map(r => r[h]).filter(Boolean);
            const detected = detectColumnConfig(h, samples);
            
            return {
              // Safe, index-based ID. This avoids all "dots/brackets" issues in IDs.
              id: `${tableId}-col-${idx}`, 
              name: h,
              type: detected.type,
              isMultiValue: detected.isMultiValue,
              sampleValues: samples,
              rule: detected.rule
            };
          });

          // Default position, but set to invisible initially for the "Toolbox" workflow
          const defaultX = 50 + (index * 40);
          const defaultY = 50 + (index * 40);

          resolve({
            id: tableId,
            name: file.name.replace(/\.[^/.]+$/, ""),
            columns,
            rowCount: 0,
            ui: { 
              x: defaultX, 
              y: defaultY, 
              width: 300, 
              height: 400, 
              scrollPos: 0,
              isVisible: false // HIDDEN BY DEFAULT
            }
          });
        }
      });
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type === 'text/csv' || f.name.endsWith('.csv'));
    const tables = await Promise.all(files.map((f, i) => processFile(f, i)));
    onFilesUploaded(tables);
  };

  const handleInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      const tables = await Promise.all(files.map((f, i) => processFile(f, i)));
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
  canvasScroll,
  projectName,
  onAddRelationship, 
  onRemoveRelationship, 
  onUpdateRelationship,
  onUpdateTables, // Changed from single table update to plural
  onUpdateCanvasScroll
}: { 
  tables: Table[], 
  relationships: Relationship[], 
  canvasScroll?: { x: number, y: number },
  projectName: string,
  onAddRelationship: (r: Relationship) => void,
  onRemoveRelationship: (id: string) => void,
  onUpdateRelationship: (r: Relationship) => void,
  onUpdateTables: (tables: Table[]) => void, // Batch update interface
  onUpdateCanvasScroll: (x: number, y: number) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null); 
  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tableScrollRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // Debounce refs
  const tableScrollTimeouts = useRef<Record<string, any>>({});
  const canvasScrollTimeout = useRef<any>(null);

  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize' | 'connect';
    tableId?: string;
    colId?: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW?: number;
    initialH?: number;
  } | null>(null);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, relId: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Toolbox Selection
  const [selectedToolboxIds, setSelectedToolboxIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);

  const [, forceUpdate] = useState(0);
  
  // 1. Restore Scroll Positions on Mount
  useLayoutEffect(() => {
    if (containerRef.current && canvasScroll) {
       containerRef.current.scrollLeft = canvasScroll.x;
       containerRef.current.scrollTop = canvasScroll.y;
    }
    tables.forEach(t => {
       const el = tableScrollRefs.current[t.id];
       if (el && t.ui?.scrollPos !== undefined) {
          el.scrollTop = t.ui.scrollPos;
       }
    });
  }, []);

  useLayoutEffect(() => {
    let frameId: number;
    let frameCount = 0;
    const stabilizeLayout = () => {
      forceUpdate(n => n + 1);
      frameCount++;
      if (frameCount < 15) { 
        frameId = requestAnimationFrame(stabilizeLayout);
      }
    };
    stabilizeLayout();

    if (containerRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        forceUpdate(n => n + 1);
      });
      resizeObserver.observe(containerRef.current);
      return () => {
        cancelAnimationFrame(frameId);
        resizeObserver.disconnect();
      };
    }
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });

      if (dragState && containerRef.current) {
        if (dragState.type === 'move' && dragState.tableId) {
          const table = tables.find(t => t.id === dragState.tableId);
          if (table) {
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            onUpdateTables([{
              ...table,
              ui: {
                ...table.ui!,
                x: dragState.initialX + dx,
                y: dragState.initialY + dy
              }
            }]);
          }
        } else if (dragState.type === 'resize' && dragState.tableId) {
           const table = tables.find(t => t.id === dragState.tableId);
           if (table) {
             const dx = e.clientX - dragState.startX;
             const dy = e.clientY - dragState.startY;
             onUpdateTables([{
               ...table,
               ui: {
                 ...table.ui!,
                 width: Math.max(200, (dragState.initialW || 300) + dx),
                 height: Math.max(200, (dragState.initialH || 300) + dy)
               }
             }]);
           }
        }
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, tables]);

  // Handle Main Canvas Scroll with Debounce Persistence
  const handleMainScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const x = target.scrollLeft;
    const y = target.scrollTop;
    
    if (canvasScrollTimeout.current) clearTimeout(canvasScrollTimeout.current);
    
    canvasScrollTimeout.current = setTimeout(() => {
       onUpdateCanvasScroll(x, y);
    }, 500); // 500ms debounce for persistence
  };

  // Handle Table Scroll with Visual Update + Debounce Persistence
  const handleTableScroll = (tableId: string, e: React.UIEvent) => {
    // 1. Force redraw of lines immediately
    forceUpdate(n => n + 1);

    // 2. Persist scroll position with debounce
    const target = e.target as HTMLElement;
    const scrollTop = target.scrollTop;

    if (tableScrollTimeouts.current[tableId]) clearTimeout(tableScrollTimeouts.current[tableId]);

    tableScrollTimeouts.current[tableId] = setTimeout(() => {
       const table = tables.find(t => t.id === tableId);
       if (table && table.ui) {
         onUpdateTables([{
            ...table,
            ui: { ...table.ui, scrollPos: scrollTop }
         }]);
       }
    }, 500);
  };

  // --- Toolbox Handlers ---

  const handleToolboxClick = (e: React.MouseEvent, id: string, allIds: string[]) => {
    e.stopPropagation();
    
    const newSelected = new Set(selectedToolboxIds);

    if (e.shiftKey && lastSelectedIdRef.current) {
        // Range selection
        const start = allIds.indexOf(lastSelectedIdRef.current);
        const end = allIds.indexOf(id);
        
        if (start !== -1 && end !== -1) {
            const low = Math.min(start, end);
            const high = Math.max(start, end);
            const range = allIds.slice(low, high + 1);
            
            // If not holding Ctrl, clear previous selection first
            if (!e.ctrlKey && !e.metaKey) {
                newSelected.clear();
            }
            range.forEach(rid => newSelected.add(rid));
        }
    } else if (e.ctrlKey || e.metaKey) {
        // Toggle selection
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
            lastSelectedIdRef.current = id;
        }
    } else {
        // Single selection
        newSelected.clear();
        newSelected.add(id);
        lastSelectedIdRef.current = id;
    }

    setSelectedToolboxIds(newSelected);
  };

  const handleToolboxDragStart = (e: React.DragEvent, id: string) => {
    let idsToDrag = Array.from(selectedToolboxIds);

    // If dragging an item NOT in the current selection, select it exclusively (standard OS behavior)
    if (!selectedToolboxIds.has(id)) {
        idsToDrag = [id];
        setSelectedToolboxIds(new Set([id]));
        lastSelectedIdRef.current = id;
    }

    // Pass IDs as JSON
    e.dataTransfer.setData('tableIds', JSON.stringify(idsToDrag));
  };

  // Canvas Drop Handler (Adding table from Sidebar)
  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    // Retrieve IDs (Handle Multi and fallback for Single)
    const tableIdsJson = e.dataTransfer.getData('tableIds');
    let ids: string[] = [];
    try {
        ids = JSON.parse(tableIdsJson);
    } catch(e) {
        const single = e.dataTransfer.getData('tableId');
        if (single) ids = [single];
    }
    
    if (ids.length === 0) return;

    // Calculate drop position
    const containerRect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const scrollLeft = containerRef.current.scrollLeft;
    
    const dropX = e.clientX - containerRect.left + scrollLeft;
    const dropY = e.clientY - containerRect.top + scrollTop;

    // Collect updates
    const updates: Table[] = [];
    ids.forEach((tid, index) => {
        const table = tables.find(t => t.id === tid);
        if (table) {
            // Stagger position for multiple items so they don't overlap perfectly
            const offsetX = index * 20;
            const offsetY = index * 20;

            updates.push({
                ...table,
                ui: {
                    ...table.ui!,
                    x: Math.max(0, dropX - (table.ui?.width || 300) / 2 + offsetX),
                    y: Math.max(0, dropY - 20 + offsetY),
                    isVisible: true
                }
            });
        }
    });

    if (updates.length > 0) {
        onUpdateTables(updates);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Clamping connection logic
  const getConnPoint = (tableId: string, colId: string, side: 'left' | 'right') => {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.ui) return null;

    // Must be visible to have a connection point
    if (table.ui.isVisible === false) return null;

    const colRefKey = `${tableId}::${colId}`;
    const colEl = colRefs.current[colRefKey];
    
    if (!colEl) return null;

    const scrollContainer = colEl.offsetParent as HTMLElement;
    if (!scrollContainer) return null;

    // Dimensions
    const containerTop = scrollContainer.offsetTop;
    const containerLeft = scrollContainer.offsetLeft;
    const containerHeight = scrollContainer.clientHeight;
    const scrollTop = scrollContainer.scrollTop;
    
    const rowTop = colEl.offsetTop;
    const rowHeight = colEl.offsetHeight;

    // Calculate "Ideal" Center Y relative to the visible scroll view
    // (rowTop - scrollTop) gives position relative to container top. 
    // We add rowHeight/2 to center it on the row.
    let relativeY = rowTop - scrollTop + (rowHeight / 2);
    
    // Clamp Y values to stay within the scroll container
    // If < 0 (scrolled up out of view), clamp to top (near header)
    // If > containerHeight (scrolled down out of view), clamp to bottom
    const buffer = 8; // Small visual buffer from edge
    let isClamped = false;

    if (relativeY < buffer) {
      relativeY = buffer;
      isClamped = true;
    } else if (relativeY > containerHeight - buffer) {
      relativeY = containerHeight - buffer;
      isClamped = true;
    }

    // Final Y relative to the Table (card)
    const localY = containerTop + relativeY;

    // Final X Calculation
    let localX = 0;
    
    // If clamped (hidden), snap to the container edge
    if (isClamped) {
       if (side === 'right') {
         localX = containerLeft + scrollContainer.clientWidth;
       } else {
         localX = containerLeft;
       }
    } else {
       // If visible, track the precise handle or row edge
       const handleEl = colEl.querySelector('.conn-handle') as HTMLElement | null;
       
       if (side === 'right' && handleEl) {
           const handleCenter = handleEl.offsetLeft + (handleEl.offsetWidth / 2);
           localX = containerLeft + colEl.offsetLeft + handleCenter;
       } else {
           // Left side connects to row edge
           localX = containerLeft + colEl.offsetLeft + (side === 'right' ? colEl.offsetWidth : 0);
       }
    }
    
    return { 
      x: table.ui.x + localX, 
      y: table.ui.y + localY
    };
  };

  const handleContextAction = (action: string) => {
    if (!contextMenu) return;
    const rel = relationships.find(r => r.id === contextMenu.relId);
    if (!rel) return;

    if (action === 'delete') {
      onRemoveRelationship(rel.id);
    } else if (action === '1:1' || action === '1:N' || action === 'N:M') {
      onUpdateRelationship({ ...rel, cardinality: action as Cardinality });
    }
  };

  const visibleTables = tables.filter(t => t.ui?.isVisible !== false);
  const hiddenTables = tables.filter(t => t.ui?.isVisible === false);

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Sidebar - Toolbox */}
      <div 
        className={`bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col z-40 overflow-hidden ${
          isSidebarOpen ? 'w-64' : 'w-0 border-none'
        }`}
      >
        {/* Fixed Width Inner Container to prevent Squishing during transition */}
        <div className="w-64 min-w-[16rem] h-full flex flex-col">
          <div className="p-3 border-b border-slate-100 flex items-center justify-end bg-slate-50 h-10">
             <button onClick={() => setIsSidebarOpen(false)} className="text-slate-400 hover:text-slate-600">
               <PanelLeftClose size={16} />
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
             {/* Root Project Node */}
             <div className="mb-2 select-none">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded text-sm font-bold text-slate-700 mb-1 hover:bg-slate-50">
                    <Database size={14} className="text-blue-600" />
                    <span className="truncate">{projectName}</span>
                </div>
                
                {/* Children (Hidden Tables) */}
                <div className="pl-3 border-l border-slate-200 ml-3.5 space-y-0.5">
                   {hiddenTables.length === 0 ? (
                     <p className="text-[10px] text-slate-400 py-1 pl-2 italic">All tables on canvas</p>
                   ) : (
                     hiddenTables.map(t => {
                       const isSelected = selectedToolboxIds.has(t.id);
                       return (
                         <div 
                           key={t.id}
                           draggable
                           onDragStart={(e) => handleToolboxDragStart(e, t.id)}
                           onClick={(e) => handleToolboxClick(e, t.id, hiddenTables.map(ht => ht.id))}
                           className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer select-none text-xs transition-colors group ${
                             isSelected ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'
                           }`}
                         >
                           <TableIcon size={12} className={`${isSelected ? 'text-blue-500' : 'text-slate-400 group-hover:text-slate-600'}`}/>
                           <span className="truncate flex-1">{t.name}</span>
                           <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-400 group-hover:bg-white'}`}>{t.columns.length}</span>
                         </div>
                       );
                     })
                   )}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Re-open Button (Absolute in Main Canvas to ensure visibility) */}
      {!isSidebarOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="absolute top-4 left-4 z-50 bg-white p-2 rounded-lg shadow-md border border-slate-200 text-slate-500 hover:text-primary hover:bg-slate-50 transition-colors"
          title="Open Toolbox"
        >
           <PanelLeftOpen size={20} />
        </button>
      )}

      {/* Main Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 bg-slate-100 relative overflow-auto select-none"
        onScroll={handleMainScroll}
        onDrop={handleCanvasDrop}
        onDragOver={handleDragOver}
        style={{ 
          backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', 
          backgroundSize: '20px 20px' 
        }}
      >
        <div 
          ref={canvasRef}
          className="w-[3000px] h-[3000px] relative"
        > 
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
            {relationships.map(rel => {
              const srcTable = tables.find(t => t.id === rel.sourceTableId);
              const tgtTable = tables.find(t => t.id === rel.targetTableId);
              // Connection lines only visible if BOTH tables are visible
              if (!srcTable?.ui || srcTable.ui.isVisible === false || !tgtTable?.ui || tgtTable.ui.isVisible === false) return null;

              const srcCenter = srcTable.ui.x + srcTable.ui.width / 2;
              const tgtCenter = tgtTable.ui.x + tgtTable.ui.width / 2;
              
              const isSourceLeft = srcCenter < tgtCenter;
              const startSide = isSourceLeft ? 'right' : 'left';
              const endSide = isSourceLeft ? 'left' : 'right';

              const start = getConnPoint(rel.sourceTableId, rel.sourceColumnId, startSide);
              const end = getConnPoint(rel.targetTableId, rel.targetColumnId, endSide);
              if (!start || !end) return null;

              const controlOffset = 50;
              const c1x = startSide === 'right' ? start.x + controlOffset : start.x - controlOffset;
              const c2x = endSide === 'right' ? end.x + controlOffset : end.x - controlOffset;

              const path = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;
              
              const startLabel = rel.cardinality === 'N:M' ? '∞' : '1';
              const endLabel = rel.cardinality === '1:1' ? '1' : '∞';

              return (
                <g key={rel.id} className="pointer-events-auto">
                  <path 
                    d={path} 
                    stroke="transparent" 
                    strokeWidth="20" 
                    fill="none" 
                    className="cursor-pointer"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, relId: rel.id });
                    }}
                  />
                  
                  <path d={path} stroke="#94a3b8" strokeWidth="4" fill="none" strokeLinecap="round" />
                  <path d={path} stroke="#2563eb" strokeWidth="2" fill="none" strokeLinecap="round" />
                  
                  <circle cx={start.x} cy={start.y} r="3" fill="#2563eb" />
                  <circle cx={end.x} cy={end.y} r="3" fill="#2563eb" />

                  <text x={startSide === 'right' ? start.x + 10 : start.x - 20} y={start.y - 5} fill="#2563eb" fontSize="12" fontWeight="bold">{startLabel}</text>
                  <text x={endSide === 'right' ? end.x + 10 : end.x - 20} y={end.y - 5} fill="#2563eb" fontSize="12" fontWeight="bold">{endLabel}</text>
                </g>
              );
            })}
            
            {dragState?.type === 'connect' && (() => {
              const start = getConnPoint(dragState.tableId!, dragState.colId!, 'right');
              if (!start || !canvasRef.current) return null;
              
              const canvasRect = canvasRef.current.getBoundingClientRect();
              const mouseX = mousePos.x - canvasRect.left;
              const mouseY = mousePos.y - canvasRect.top;
              
              return (
                <line 
                    x1={start.x} 
                    y1={start.y} 
                    x2={mouseX} 
                    y2={mouseY} 
                    stroke="#2563eb" 
                    strokeWidth="2" 
                    strokeDasharray="5,5" 
                  />
              );
            })()}
          </svg>

          {visibleTables.map((table) => {
             const ui = table.ui || { x: 50, y: 50, width: 300, height: 400 };

             return (
              <div 
                key={table.id}
                ref={el => tableRefs.current[table.id] = el}
                className="absolute bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col z-20 group"
                style={{
                  left: ui.x,
                  top: ui.y,
                  width: ui.width,
                  height: ui.height
                }}
              >
                <div 
                  className="h-10 px-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between cursor-move rounded-t-lg"
                  onMouseDown={(e) => {
                     e.stopPropagation();
                     setDragState({
                       type: 'move',
                       tableId: table.id,
                       startX: e.clientX,
                       startY: e.clientY,
                       initialX: ui.x,
                       initialY: ui.y
                     });
                  }}
                >
                  <span className="font-semibold text-slate-700 truncate text-sm flex items-center gap-2">
                     <Database size={14} className="text-slate-400"/> {table.name}
                  </span>
                  
                  <div className="flex items-center gap-1">
                     <button 
                       className="p-1 text-slate-400 hover:text-slate-600 rounded"
                       title="Hide Table"
                       onMouseDown={(e) => {
                          e.stopPropagation();
                          onUpdateTables([{ ...table, ui: { ...table.ui!, isVisible: false }}]);
                       }}
                     >
                       <EyeOff size={14} />
                     </button>
                     <Move size={14} className="text-slate-400" />
                  </div>
                </div>

                {/* IMPORTANT: 'relative' here makes this div the offsetParent for the rows */}
                <div 
                  ref={el => tableScrollRefs.current[table.id] = el}
                  className="flex-1 overflow-y-auto overflow-x-hidden p-2 relative"
                  onScroll={(e) => handleTableScroll(table.id, e)}
                >
                  {table.columns.map(col => {
                    const isSource = relationships.some(r => r.sourceColumnId === col.id);
                    const isTarget = relationships.some(r => r.targetColumnId === col.id);
                    const isConnected = isSource || isTarget;

                    return (
                      <div 
                        key={col.id}
                        ref={el => {
                          const refKey = `${table.id}::${col.id}`;
                          if (el) colRefs.current[refKey] = el;
                          else delete colRefs.current[refKey];
                        }}
                        className={`relative flex items-center justify-between p-2 rounded text-xs mb-1 transition-colors ${isConnected ? 'bg-blue-50/30' : 'hover:bg-slate-50'}`}
                      >
                        <span className={`font-medium truncate mr-2 flex-1 ${isConnected ? 'text-blue-700' : 'text-slate-700'}`} title={col.name}>{col.name}</span>
                        
                        <div 
                          className={`conn-handle w-3 h-3 rounded-full border cursor-crosshair transition-all shadow-sm ${
                            isConnected 
                              ? 'bg-blue-500 border-blue-600 scale-110' 
                              : 'bg-slate-100 border-slate-300 hover:bg-blue-400 hover:border-blue-500'
                          }`}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDragState({
                              type: 'connect',
                              tableId: table.id,
                              colId: col.id,
                              startX: e.clientX,
                              startY: e.clientY,
                              initialX: 0, initialY: 0
                            });
                          }}
                        />
                        
                        {dragState?.type === 'connect' && dragState.tableId !== table.id && (
                          <div 
                             className="absolute inset-0 bg-blue-500/10 border border-blue-500 rounded cursor-pointer z-50"
                             onMouseUp={(e) => {
                               e.stopPropagation();
                               if (dragState.colId) {
                                 onAddRelationship({
                                   id: `rel-${Date.now()}`,
                                   sourceTableId: dragState.tableId!,
                                   sourceColumnId: dragState.colId,
                                   targetTableId: table.id,
                                   targetColumnId: col.id,
                                   cardinality: '1:N'
                                 });
                               }
                               setDragState(null);
                             }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div 
                  className="absolute bottom-1 right-1 cursor-nwse-resize text-slate-300 hover:text-slate-500 p-1"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragState({
                      type: 'resize',
                      tableId: table.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      initialX: 0, initialY: 0, 
                      initialW: ui.width,
                      initialH: ui.height
                    });
                  }}
                >
                  <Maximize2 size={12} className="rotate-90" />
                </div>
              </div>
             );
          })}
        </div>

        {contextMenu && (
          <div 
            className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 w-48 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
             <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
               Relationship
             </div>
             <button onClick={() => handleContextAction('1:1')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary flex justify-between">
               One-to-One <span>1:1</span>
             </button>
             <button onClick={() => handleContextAction('1:N')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary flex justify-between">
               One-to-Many <span>1:∞</span>
             </button>
             <button onClick={() => handleContextAction('N:M')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-primary flex justify-between">
               Many-to-Many <span>∞:∞</span>
             </button>
             <div className="h-px bg-slate-100 my-1" />
             <button onClick={() => handleContextAction('delete')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
               <Trash2 size={14} /> Delete
             </button>
          </div>
        )}

        <div className="absolute top-4 right-4 w-64 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 p-3 z-30 max-h-64 overflow-y-auto">
          <h4 className="font-semibold text-slate-800 mb-2 text-xs uppercase tracking-wide">Connections</h4>
          {relationships.length === 0 && <p className="text-xs text-slate-400">Drag column handle to connect.</p>}
          <div className="space-y-1">
            {relationships.map(rel => {
                 const srcT = tables.find(t => t.id === rel.sourceTableId);
                 const tgtT = tables.find(t => t.id === rel.targetTableId);
                 const srcC = srcT?.columns.find(c => c.id === rel.sourceColumnId);
                 const tgtC = tgtT?.columns.find(c => c.id === rel.targetColumnId);
                 
                 // Show connection in list even if table hidden? Maybe, but let's hide to reduce clutter
                 if (!srcT?.ui || srcT.ui.isVisible === false || !tgtT?.ui || tgtT.ui.isVisible === false) return null;

                 return (
                   <div key={rel.id} className="flex items-center justify-between text-xs p-1.5 bg-slate-50 rounded border border-slate-100 group">
                      <div className="flex flex-col overflow-hidden w-full">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="font-medium text-blue-600 truncate max-w-[80px]">{srcT?.name}</span>
                          <ArrowRight size={10} className="text-slate-300 flex-shrink-0" />
                          <span className="font-medium text-blue-600 truncate max-w-[80px]">{tgtT?.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="truncate max-w-[80px]">{srcC?.name}</span>
                          <span className="text-[10px] bg-slate-200 px-1 rounded">{rel.cardinality || '1:N'}</span>
                          <span className="truncate max-w-[80px] text-right">{tgtC?.name}</span>
                        </div>
                      </div>
                      <button onClick={() => onRemoveRelationship(rel.id)} className="ml-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
const RulesConfiguration = ({ tables, onUpdateTable }: { tables: Table[], onUpdateTable: (t: Table) => void }) => {
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id);
  const activeTable = tables.find(t => t.id === selectedTableId);

  const handleRuleChange = (colId: string, rule: GenerationRule) => {
    if (!activeTable) return;
    const newCols = activeTable.columns.map(c => c.id === colId ? { ...c, rule } : c);
    onUpdateTable({ ...activeTable, columns: newCols });
  };

  const handleSettingsChange = (settings: TableGenerationSettings) => {
    if (!activeTable) return;
    onUpdateTable({ ...activeTable, genSettings: settings });
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-2 overflow-y-auto">
        <h3 className="font-medium text-slate-500 text-sm uppercase tracking-wider mb-2">Tables</h3>
        {tables.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedTableId(t.id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selectedTableId === t.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
          >
            <Settings size={18} />
            <span className="truncate">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
        {activeTable && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
               <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                 <Database size={20} className="text-blue-500"/> Table Generation Settings
               </h3>
               <div className="grid grid-cols-2 gap-6">
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Generation Mode</label>
                   <select 
                     value={activeTable.genSettings?.mode || 'fixed'}
                     onChange={(e) => handleSettingsChange({ ...activeTable.genSettings!, mode: e.target.value as any })}
                     className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                   >
                     <option value="fixed">Fixed Row Count</option>
                     <option value="per_parent">Per Parent Row (Loop)</option>
                   </select>
                 </div>
                 {(!activeTable.genSettings?.mode || activeTable.genSettings.mode === 'fixed') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Row Count</label>
                      <input 
                        type="number" 
                        value={activeTable.genSettings?.fixedCount ?? 100}
                        onChange={(e) => handleSettingsChange({ ...activeTable.genSettings!, fixedCount: parseInt(e.target.value) || 0, mode: 'fixed' })}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      />
                    </div>
                 )}
                 {activeTable.genSettings?.mode === 'per_parent' && (
                    <>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Driving Parent Table</label>
                          <select
                            value={activeTable.genSettings?.drivingParentTableId || ''}
                            onChange={(e) => handleSettingsChange({ ...activeTable.genSettings!, drivingParentTableId: e.target.value, mode: 'per_parent', fixedCount: 0 })}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                          >
                             <option value="">Select Parent Table...</option>
                             {tables.filter(t => t.id !== activeTable.id).map(t => (
                               <option key={t.id} value={t.id}>{t.name}</option>
                             ))}
                          </select>
                       </div>
                       <div className="flex gap-4">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Min Rows / Parent</label>
                            <input 
                              type="number"
                              value={activeTable.genSettings?.minPerParent ?? 1}
                              onChange={(e) => handleSettingsChange({ ...activeTable.genSettings!, minPerParent: parseInt(e.target.value) || 0, mode: 'per_parent', fixedCount: 0 })}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-700 mb-2">Max Rows / Parent</label>
                            <input 
                              type="number"
                              value={activeTable.genSettings?.maxPerParent ?? 5}
                              onChange={(e) => handleSettingsChange({ ...activeTable.genSettings!, maxPerParent: parseInt(e.target.value) || 0, mode: 'per_parent', fixedCount: 0 })}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                       </div>
                    </>
                 )}
               </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-lg font-semibold text-slate-800">Column Rules</h3>
               </div>
               <div className="divide-y divide-slate-100">
                 {activeTable.columns.map(col => (
                   <div key={col.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex items-start gap-4 mb-4">
                         <div className="mt-1 p-2 bg-blue-50 text-blue-600 rounded-lg"><Hash size={16} /></div>
                         <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                               <h4 className="font-semibold text-slate-700">{col.name}</h4>
                               <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">{col.type}</span>
                            </div>
                            <p className="text-sm text-slate-400 truncate max-w-md">{col.sampleValues.slice(0,5).join(', ')}</p>
                         </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-14">
                         <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Strategy</label>
                            <select 
                              value={col.rule.type}
                              onChange={(e) => handleRuleChange(col.id, { ...col.rule, type: e.target.value as GenerationStrategyType })}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                            >
                               {Object.values(GenerationStrategyType).map(t => (
                                 <option key={t} value={t}>{t}</option>
                               ))}
                            </select>
                         </div>
                         <div className="flex-1">
                            {col.rule.type === GenerationStrategyType.PATTERN && (
                               <div>
                                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pattern (use # for number)</label>
                                  <input 
                                    type="text" 
                                    value={col.rule.config?.pattern || ''}
                                    placeholder="e.g. ORD-####"
                                    onChange={(e) => handleRuleChange(col.id, { ...col.rule, config: { ...col.rule.config, pattern: e.target.value } })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                  />
                               </div>
                            )}
                            {col.rule.type === GenerationStrategyType.RANDOM && (
                               <div>
                                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Options (comma separated)</label>
                                  <input 
                                    type="text" 
                                    value={col.rule.config?.options?.join(', ') || ''}
                                    onChange={(e) => handleRuleChange(col.id, { ...col.rule, config: { ...col.rule.config, options: e.target.value.split(',').map(s => s.trim()) } })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                                  />
                               </div>
                            )}
                            {col.rule.type === GenerationStrategyType.AI && (
                               <div>
                                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                    <Sparkles size={12} className="text-purple-500"/> AI Prompt
                                  </label>
                                  <textarea 
                                    value={col.rule.config?.aiPrompt || ''}
                                    placeholder="Describe what kind of data to generate..."
                                    onChange={(e) => handleRuleChange(col.id, { ...col.rule, config: { ...col.rule.config, aiPrompt: e.target.value } })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm h-[38px] min-h-[38px] resize-y"
                                  />
                               </div>
                            )}
                         </div>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 6. Export Panel
const ExportPanel = ({ tables, relationships }: { tables: Table[], relationships: Relationship[] }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState("");

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgress("Starting...");
    try {
      await generateAndDownload(tables, relationships, 0, setProgress);
    } catch (e) {
      console.error(e);
      setProgress("Error occurred.");
    } finally {
      setTimeout(() => {
         setIsGenerating(false);
         setProgress("");
      }, 2000);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 p-12">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full text-center">
         <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Download size={40} />
         </div>
         <h2 className="text-2xl font-bold text-slate-800 mb-2">Ready to Generate</h2>
         <p className="text-slate-500 mb-8">
           We have {tables.length} tables and {relationships.length} relationships configured.
           Click below to generate your synthetic dataset.
         </p>
         
         {isGenerating ? (
            <div className="space-y-4">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className="h-full bg-primary animate-progress origin-left w-full"></div>
              </div>
              <p className="text-sm font-medium text-slate-600 animate-pulse">{progress}</p>
            </div>
         ) : (
            <button 
              onClick={handleGenerate}
              className="w-full py-4 bg-primary hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-blue-500/30 transition-all transform hover:-translate-y-1"
            >
              Generate & Download ZIP
            </button>
         )}
      </div>
    </div>
  );
};

// Main Editor Component
const Editor = ({ project, onSave, onBack }: { project: Project, onSave: (p: Project) => void, onBack: () => void }) => {
  const [localProject, setLocalProject] = useState<Project>(project);
  
  useEffect(() => {
     setLocalProject(project);
  }, [project.id]);

  const handleUpdate = (updates: Partial<Project>) => {
     const updated = { ...localProject, ...updates };
     setLocalProject(updated);
     onSave(updated); // Auto-save
  };

  const handleFilesUploaded = (newTables: Table[]) => {
     const mergedTables = [...localProject.state.tables, ...newTables];
     handleUpdate({ 
       state: { ...localProject.state, tables: mergedTables },
       currentStep: 2
     });
  };

  const handleUpdateTable = (updatedTable: Table) => {
     const newTables = localProject.state.tables.map(t => t.id === updatedTable.id ? updatedTable : t);
     handleUpdate({ state: { ...localProject.state, tables: newTables } });
  };
  
  // New Plural Update Handler
  const handleUpdateTables = (updatedTables: Table[]) => {
     const updatesMap = new Map(updatedTables.map(t => [t.id, t]));
     const newTables = localProject.state.tables.map(t => updatesMap.get(t.id) || t);
     handleUpdate({ state: { ...localProject.state, tables: newTables } });
  };

  const handleCanvasScroll = (x: number, y: number) => {
     handleUpdate({ state: { ...localProject.state, canvasScroll: { x, y } } });
  }

  const handleAddRelationship = (rel: Relationship) => {
    handleUpdate({ state: { ...localProject.state, relationships: [...localProject.state.relationships, rel] } });
  };

  const handleRemoveRelationship = (id: string) => {
    handleUpdate({ state: { ...localProject.state, relationships: localProject.state.relationships.filter(r => r.id !== id) } });
  };

  const handleUpdateRelationship = (rel: Relationship) => {
    handleUpdate({ state: { ...localProject.state, relationships: localProject.state.relationships.map(r => r.id === rel.id ? rel : r) } });
  };

  const renderStep = () => {
    switch (localProject.currentStep) {
      case 1: 
        return <FileUploadStep onFilesUploaded={handleFilesUploaded} />;
      case 2:
        return <SchemaStep tables={localProject.state.tables} onUpdateTable={handleUpdateTable} />;
      case 3:
        return <RelationshipMapper 
                  tables={localProject.state.tables} 
                  relationships={localProject.state.relationships}
                  canvasScroll={localProject.state.canvasScroll}
                  projectName={localProject.name}
                  onAddRelationship={handleAddRelationship}
                  onRemoveRelationship={handleRemoveRelationship}
                  onUpdateRelationship={handleUpdateRelationship}
                  onUpdateTables={handleUpdateTables} // Pass plural handler
                  onUpdateCanvasScroll={handleCanvasScroll}
               />;
      case 4:
        return <RulesConfiguration tables={localProject.state.tables} onUpdateTable={handleUpdateTable} />;
      case 5:
        return <ExportPanel tables={localProject.state.tables} relationships={localProject.state.relationships} />;
      default:
        return <div>Unknown Step</div>;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <Navbar 
        step={localProject.currentStep} 
        projectName={localProject.name}
        onBack={onBack}
        onSave={() => onSave(localProject)}
        onStepChange={(step) => handleUpdate({ currentStep: step })}
        canNavigate={localProject.state.tables.length > 0}
      />
      {renderStep()}
    </div>
  );
};

export default Editor;