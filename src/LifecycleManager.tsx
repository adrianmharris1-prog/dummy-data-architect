import React, { useState } from 'react';
import { 
  Plus, Trash2, Layers, ListTodo, Save, ChevronRight, 
  ArrowLeft, Clock, Settings2, CheckCircle2, X, Table as TableIcon, RefreshCw, Link,
  ArrowUp, ArrowDown
} from 'lucide-react';
import { Project, LifecyclePolicy, LifecycleState, Table, DataType, GenerationStrategyType, Column } from './types';

interface LifecycleManagerProps {
  project: Project;
  onSave: (updatedProject: Project) => void;
  onClose: () => void;
}

export const LifecycleManager = ({ project, onSave, onClose }: LifecycleManagerProps) => {
  const [policies, setPolicies] = useState<LifecyclePolicy[]>(project.state.policies || []);
  const [localTables, setLocalTables] = useState<Table[]>(project.state.tables || []);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(
    policies.length > 0 ? policies[0].id : null
  );
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'policies' | 'assignments'>('policies');

  const activePolicy = policies.find(p => p.id === selectedPolicyId);

  const handleAddPolicy = () => {
    const newPolicy: LifecyclePolicy = {
      id: crypto.randomUUID(),
      name: `New Policy ${policies.length + 1}`,
      states: [
        { id: crypto.randomUUID(), name: 'Draft', sequence: 1, minDurationDays: 1, maxDurationDays: 7 },
        { id: crypto.randomUUID(), name: 'Released', sequence: 2, minDurationDays: 30, maxDurationDays: 365 }
      ]
    };
    const updated = [...policies, newPolicy];
    setPolicies(updated);
    setSelectedPolicyId(newPolicy.id);
  };

  const handleDeletePolicy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = policies.filter(p => p.id !== id);
    setPolicies(updated);
    setLocalTables(localTables.map(t => t.lifecyclePolicyId === id ? { ...t, lifecyclePolicyId: undefined } : t));
    if (selectedPolicyId === id) {
      setSelectedPolicyId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleUpdatePolicyName = (name: string) => {
    if (!selectedPolicyId) return;
    setPolicies(policies.map(p => p.id === selectedPolicyId ? { ...p, name } : p));
  };

  const handleInsertState = (index: number) => {
    if (!activePolicy) return;
    const newState: LifecycleState = {
      id: crypto.randomUUID(),
      name: `New State`,
      sequence: 0, // Will be fixed below
      minDurationDays: 1,
      maxDurationDays: 30
    };
    
    const newStates = [...activePolicy.states];
    newStates.splice(index, 0, newState);
    
    // Recalculate sequences
    const finalizedStates = newStates.map((s, idx) => ({ ...s, sequence: idx + 1 }));
    
    setPolicies(policies.map(p => p.id === activePolicy.id ? { ...p, states: finalizedStates } : p));
  };

  const handleMoveState = (index: number, direction: 'up' | 'down') => {
    if (!activePolicy) return;
    const newStates = [...activePolicy.states];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newStates.length) return;
    
    const [movedItem] = newStates.splice(index, 1);
    newStates.splice(targetIndex, 0, movedItem);
    
    const finalizedStates = newStates.map((s, idx) => ({ ...s, sequence: idx + 1 }));
    setPolicies(policies.map(p => p.id === activePolicy.id ? { ...p, states: finalizedStates } : p));
  };

  const handleUpdateState = (stateId: string, updates: Partial<LifecycleState>) => {
    if (!activePolicy) return;
    const updatedStates = activePolicy.states.map(s => s.id === stateId ? { ...s, ...updates } : s);
    setPolicies(policies.map(p => p.id === activePolicy.id ? { ...p, states: updatedStates } : p));
  };

  const handleRemoveState = (stateId: string) => {
    if (!activePolicy) return;
    const updatedStates = activePolicy.states.filter(s => s.id !== stateId)
      .map((s, idx) => ({ ...s, sequence: idx + 1 }));
    setPolicies(policies.map(p => p.id === activePolicy.id ? { ...p, states: updatedStates } : p));
  };

  const handleSyncTables = () => {
    const updatedTables = localTables.map(table => {
      if (table.lifecyclePolicyId) {
        const policy = policies.find(p => p.id === table.lifecyclePolicyId);
        if (policy) {
          // 1. Identify which columns are lifecycle managed
          // Pattern: name is "current", "current.start", etc. or starts with "state["
          const isLifecycleCol = (name: string) => 
            name === 'current' || name.startsWith('current.') || name.startsWith('state[');
          
          // Separate existing user columns
          const userColumns = table.columns.filter(c => !isLifecycleCol(c.name));
          
          // 2. Construct the fresh list of lifecycle columns in the exact requested order
          const newLifecycleColumns: Column[] = [];
          
          // - Add "current" status
          newLifecycleColumns.push({
            id: crypto.randomUUID(),
            name: 'current',
            type: DataType.DROPDOWN,
            rule: { 
              type: GenerationStrategyType.COPY, 
              config: { label: "Lifecycle Status", options: policy.states.map(s => s.name) } 
            },
            sampleValues: []
          });

          // Metadata for suffixes
          const attributeGroups = [
            { suffix: 'start', type: DataType.DATE, strategy: GenerationStrategyType.LIFECYCLE_DATE },
            { suffix: 'end', type: DataType.DATE, strategy: GenerationStrategyType.LIFECYCLE_DATE },
            { suffix: 'actual', type: DataType.DATE, strategy: GenerationStrategyType.LIFECYCLE_DATE },
            { suffix: 'duration', type: DataType.INTEGER, strategy: GenerationStrategyType.LIFECYCLE_DURATION }
          ];

          // - Add Bridge Attributes (Immediately after current)
          attributeGroups.forEach(group => {
            newLifecycleColumns.push({
              id: crypto.randomUUID(),
              name: `current.${group.suffix}`,
              type: group.type,
              sampleValues: [],
              rule: {
                type: group.strategy,
                config: { 
                  label: `Lifecycle Current ${group.suffix.charAt(0).toUpperCase() + group.suffix.slice(1)}` 
                }
              }
            });
          });

          // - Add State Specific Columns (Grouped by suffix first, then state order)
          attributeGroups.forEach(group => {
            policy.states.forEach((state) => {
              const colName = `state[${state.name}].${group.suffix}`;
              newLifecycleColumns.push({
                id: crypto.randomUUID(),
                name: colName,
                type: group.type,
                sampleValues: [],
                rule: {
                  type: group.strategy,
                  config: { 
                    label: `Lifecycle ${group.suffix.charAt(0).toUpperCase() + group.suffix.slice(1)}` 
                  }
                }
              });
            });
          });

          // 3. Reconcile with existing columns to preserve IDs/stable schema
          const reconciledLifecycleCols = newLifecycleColumns.map(newCol => {
            const existing = table.columns.find(c => c.name === newCol.name);
            if (existing) {
              return { 
                ...newCol, 
                id: existing.id, 
                // Merge rule config but prioritize our fresh labels/strategies
                rule: {
                  ...newCol.rule,
                  config: { ...existing.rule.config, label: newCol.rule.config?.label }
                }
              };
            }
            return newCol;
          });

          // Final merged schema: user columns first, then lifecycle columns (ordered)
          return { ...table, columns: [...userColumns, ...reconciledLifecycleCols] };
        }
      }
      return table;
    });

    setLocalTables(updatedTables);
    onSave({ ...project, state: { ...project.state, tables: updatedTables, policies } });
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  const handleGlobalSave = () => {
    onSave({
      ...project,
      state: {
        ...project.state,
        policies: policies,
        tables: localTables
      }
    });
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden animate-in fade-in duration-300">
      {/* Top Navbar */}
      <div className="h-16 border-b bg-white flex items-center px-6 justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col border-r border-slate-200 pr-6 mr-2">
            <h1 className="font-semibold text-sm text-slate-800">{project.name}</h1>
            <span className="text-xs text-slate-400 font-medium">Lifecycle Policy Manager</span>
          </div>
          
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('policies')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'policies' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Policies & States
            </button>
            <button 
              onClick={() => setActiveTab('assignments')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'assignments' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Table Assignments
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {showSaveSuccess && (
            <div className="flex items-center gap-2 text-green-600 font-bold text-sm animate-in slide-in-from-top-2 duration-300">
              <CheckCircle2 size={16} />
              Saved Successfully
            </div>
          )}
          <button 
            onClick={handleGlobalSave}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Save size={16} />
            Save All Changes
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'policies' ? (
          <>
            {/* Sidebar - Policy List */}
            <div className="w-72 bg-white border-r border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Policies</h3>
                <button 
                  onClick={handleAddPolicy}
                  className="p-1.5 bg-primary text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                  title="Add New Policy"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                {policies.length === 0 ? (
                  <div className="p-8 text-center">
                    <Layers size={32} className="mx-auto text-slate-200 mb-2" />
                    <p className="text-xs text-slate-400 italic font-medium">No policies defined.</p>
                  </div>
                ) : (
                  policies.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPolicyId(p.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${
                        selectedPolicyId === p.id 
                          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' 
                          : 'hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Layers size={18} className={selectedPolicyId === p.id ? 'text-blue-500' : 'text-slate-400'} />
                        <span className={`font-bold text-sm truncate ${selectedPolicyId === p.id ? 'text-blue-900' : ''}`}>
                          {p.name}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => handleDeletePolicy(p.id, e)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Main Content Area - Policy Editor */}
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
              {activePolicy ? (
                <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-2 duration-400">
                  {/* Policy Settings */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                        <Settings2 size={24} />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">Policy Details</h2>
                        <p className="text-sm text-slate-500">Define the lifecycle progression states for your data.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Policy Name</label>
                      <input 
                        type="text" 
                        value={activePolicy.name}
                        onChange={(e) => handleUpdatePolicyName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-800 focus:ring-2 focus:ring-primary focus:bg-white transition-all outline-none"
                        placeholder="e.g. Engineering Change Process"
                      />
                    </div>
                  </div>

                  {/* States Management */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden pb-12">
                    <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                      <div className="flex items-center gap-3">
                        <ListTodo size={20} className="text-blue-500" />
                        <h3 className="font-bold text-slate-800">Sequence of States</h3>
                      </div>
                      <button 
                        onClick={() => handleInsertState(activePolicy.states.length)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors shadow-sm active:scale-95"
                      >
                        <Plus size={16} /> Add State
                      </button>
                    </div>

                    <div className="p-8">
                      {activePolicy.states.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl">
                          <p className="text-slate-400 italic font-medium">No states defined. Add one to get started.</p>
                        </div>
                      ) : (
                        <div className="relative">
                          {activePolicy.states.map((state, idx) => (
                            <React.Fragment key={state.id}>
                              {/* Insertion marker before each state */}
                              <div className="relative h-4 group/insert">
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/insert:opacity-100 transition-opacity">
                                  <button 
                                    onClick={() => handleInsertState(idx)}
                                    className="z-10 bg-primary text-white p-1 rounded-full shadow-lg hover:scale-125 transition-transform"
                                    title="Insert state here"
                                  >
                                    <Plus size={12} />
                                  </button>
                                  <div className="absolute h-px w-full bg-primary/30 pointer-events-none" />
                                </div>
                              </div>

                              <div className="group relative flex items-center gap-6 p-6 border border-slate-100 rounded-2xl bg-white hover:border-primary/30 hover:shadow-md transition-all">
                                <div className="flex flex-col gap-1 items-center shrink-0">
                                  <button 
                                    onClick={() => handleMoveState(idx, 'up')}
                                    disabled={idx === 0}
                                    className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-0 transition-all"
                                  >
                                    <ArrowUp size={14} />
                                  </button>
                                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500 group-hover:bg-primary group-hover:text-white transition-colors">
                                    {idx + 1}
                                  </div>
                                  <button 
                                    onClick={() => handleMoveState(idx, 'down')}
                                    disabled={idx === activePolicy.states.length - 1}
                                    className="p-1 rounded hover:bg-slate-100 text-slate-400 disabled:opacity-0 transition-all"
                                  >
                                    <ArrowDown size={14} />
                                  </button>
                                </div>
                                
                                <div className="flex-1">
                                  <input 
                                    type="text" 
                                    value={state.name}
                                    onChange={(e) => handleUpdateState(state.id, { name: e.target.value })}
                                    placeholder="e.g. Review"
                                    className="w-full text-lg font-bold text-slate-800 bg-transparent border-b-2 border-transparent focus:border-primary focus:outline-none transition-all py-1"
                                  />
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1 ml-0.5">State Label (Used in column names)</div>
                                </div>

                                <div className="flex items-center gap-6 border-l border-slate-100 pl-6">
                                  <div className="space-y-1.5 text-center">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 justify-center">
                                      <Clock size={10} className="text-blue-400" /> Min Days
                                    </label>
                                    <input 
                                      type="number" 
                                      value={state.minDurationDays}
                                      onChange={(e) => handleUpdateState(state.id, { minDurationDays: parseInt(e.target.value) || 0 })}
                                      className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                  <div className="space-y-1.5 text-center">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 justify-center">
                                      <Clock size={10} className="text-purple-400" /> Max Days
                                    </label>
                                    <input 
                                      type="number" 
                                      value={state.maxDurationDays}
                                      onChange={(e) => handleUpdateState(state.id, { maxDurationDays: parseInt(e.target.value) || 0 })}
                                      className="w-20 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:ring-1 focus:ring-primary outline-none"
                                    />
                                  </div>
                                  <button 
                                    onClick={() => handleRemoveState(state.id)}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete State"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                  <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
                    <Layers size={40} className="text-slate-200" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-1">Select or Create a Policy</h3>
                  <button 
                    onClick={handleAddPolicy}
                    className="px-6 py-2 bg-primary text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                  >
                    Create New Policy
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Table Assignments View */
          <div className="flex-1 overflow-y-auto p-10 bg-slate-50/50">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                      <Link size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Assign Policies to Tables</h2>
                      <p className="text-sm text-slate-500">Link tables to lifecycle policies to automatically inject tracking columns.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleSyncTables}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-bold transition-all"
                    title="Propagate renames, deletions and updates to all assigned tables"
                  >
                    <RefreshCw size={16} />
                    Sync & Update Columns
                  </button>
                </div>

                <div className="space-y-3">
                  {localTables.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400 italic font-medium">
                      No tables found in project. Upload schemas first.
                    </div>
                  ) : (
                    localTables.map(table => (
                      <div key={table.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:bg-white transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-blue-500 shadow-sm">
                            <TableIcon size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{table.name}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">
                              {table.columns.length} Total Columns
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <ChevronRight size={16} className="text-slate-300" />
                          <select 
                            value={table.lifecyclePolicyId || ''}
                            onChange={(e) => {
                              const updated = localTables.map(t => t.id === table.id ? { ...t, lifecyclePolicyId: e.target.value || undefined } : t);
                              setLocalTables(updated);
                            }}
                            className={`min-w-[240px] border rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none transition-all ${
                              table.lifecyclePolicyId 
                                ? 'bg-blue-50 border-blue-200 text-blue-900 ring-1 ring-blue-100' 
                                : 'bg-white border-slate-300 text-slate-500'
                            }`}
                          >
                            <option value="">No Lifecycle Assigned</option>
                            {policies.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-8 p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                  <h4 className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-2">
                    <CheckCircle2 size={14} /> Intelligence Synchronizer
                  </h4>
                  <p className="text-xs text-blue-600 leading-relaxed font-medium">
                    The Sync button performs a destructive reconciliation. It removes stale columns 
                    if states were deleted and re-sorts all lifecycle columns into the standardized grouping:
                  </p>
                  <ul className="mt-2 space-y-1">
                    <li className="text-[10px] text-blue-500 flex items-center gap-2 font-bold italic">
                      1. current status, then 2. .start group, then 3. .end group, etc.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
