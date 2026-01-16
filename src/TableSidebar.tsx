import React from 'react';
import { 
  Settings, Users, Layers, Shield, Database, 
  ChevronDown, Info, Lock, Clock, ArrowRight
} from 'lucide-react';
import { Table, TableType, DataType, Actor, LifecyclePolicy, TableGenerationSettings } from './types';

interface TableSidebarProps {
  table: Table;
  policies: LifecyclePolicy[];
  onUpdate: (updatedTable: Table) => void;
  actors: Actor[];
  onOpenActors: () => void;
}

export const TableSidebar = ({ table, policies, onUpdate, actors, onOpenActors }: TableSidebarProps) => {
  const handleSettingsChange = (updates: Partial<TableGenerationSettings>) => {
    onUpdate({
      ...table,
      genSettings: {
        ...(table.genSettings || { mode: 'fixed', fixedCount: 10 }),
        ...updates
      }
    });
  };

  const assignedPolicy = policies.find(p => p.id === table.lifecyclePolicyId);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {/* Generation Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold">
          <Settings size={18} className="text-primary" />
          <h3>Generation Mode</h3>
        </div>
        
        <div className="space-y-4">
          <div className="flex p-1 bg-slate-100 rounded-lg">
            <button 
              onClick={() => handleSettingsChange({ mode: 'fixed' })}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${table.genSettings?.mode !== 'per_parent' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Fixed Count
            </button>
            <button 
              onClick={() => handleSettingsChange({ mode: 'per_parent' })}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${table.genSettings?.mode === 'per_parent' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Hierarchical
            </button>
          </div>

          {table.genSettings?.mode === 'per_parent' ? (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Min per Parent</label>
                <input 
                  type="number" 
                  value={table.genSettings.minPerParent || 1}
                  onChange={(e) => handleSettingsChange({ minPerParent: parseInt(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Max per Parent</label>
                <input 
                  type="number" 
                  value={table.genSettings.maxPerParent || 5}
                  onChange={(e) => handleSettingsChange({ maxPerParent: parseInt(e.target.value) || 0 })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total Records</label>
              <input 
                type="number" 
                value={table.genSettings?.fixedCount || 10}
                onChange={(e) => handleSettingsChange({ fixedCount: parseInt(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Lifecycle Status */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold">
          <Layers size={18} className="text-purple-500" />
          <h3>Lifecycle Policy</h3>
        </div>
        
        {assignedPolicy ? (
          <div className="space-y-3">
            <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg">
              <div className="text-xs font-bold text-purple-700">{assignedPolicy.name}</div>
              <div className="text-[10px] text-purple-500 mt-1">{assignedPolicy.states.length} Active States</div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 italic">
              <Info size={12} />
              Managed in Lifecycles view
            </div>
          </div>
        ) : (
          <div className="h-[84px] flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg bg-slate-50">
            <span className="text-xs text-slate-400">No policy assigned</span>
          </div>
        )}
      </div>

      {/* Permissions / Metadata */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold">
            <Users size={18} className="text-blue-500" />
            <h3>Access Control</h3>
          </div>
          <button onClick={onOpenActors} className="text-[10px] text-primary font-bold hover:underline">Manage Actors</button>
        </div>

        <div className="space-y-3">
           <div>
             <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Table Type</label>
             <select 
               value={table.tableType || 'Object'}
               onChange={(e) => onUpdate({ ...table, tableType: e.target.value as TableType })}
               className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none bg-white"
             >
               <option value="Object">Business Object</option>
               <option value="Relationship">Relationship / Link</option>
             </select>
           </div>
           
           <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
             <Shield size={14} className="text-slate-400" />
             <span className="text-xs text-slate-600 font-medium">
               {actors.length > 0 ? `${actors.length} Actors Available` : 'No Actors Defined'}
             </span>
           </div>
        </div>
      </div>
    </div>
  );
};
