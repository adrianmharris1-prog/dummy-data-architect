import React, { useState } from 'react';
import { Plus, Trash2, Clock, Database, Network, Search, FolderOpen, AlertTriangle, X } from 'lucide-react';
import { Project } from './types';
import { createNewProject, deleteProject, saveProject } from './services/storageService';

interface DashboardProps {
  projects: Project[];
  onOpenProject: (project: Project) => void;
  onProjectsChange: () => void;
}

export const Dashboard = ({ projects, onOpenProject, onProjectsChange }: DashboardProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    
    const newProject = createNewProject(newProjectName);
    saveProject(newProject);
    onProjectsChange();
    onOpenProject(newProject); 
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedProjectId) {
      setProjectToDelete(selectedProjectId);
    }
  };

  const confirmDelete = () => {
    if (projectToDelete) {
      deleteProject(projectToDelete);
      setProjectToDelete(null);
      setSelectedProjectId(null);
      onProjectsChange();
    }
  };

  const cancelDelete = () => {
    setProjectToDelete(null);
  };

  const handleRowClick = (id: string) => {
    setSelectedProjectId(prev => (prev === id ? null : id)); // Toggle selection
  };

  const handleRowDoubleClick = (project: Project) => {
    onOpenProject(project);
  };

  // Create a sorted copy to avoid mutating props
  const sortedProjects = [...projects].sort((a, b) => b.lastModified - a.lastModified);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-8">
      <div className="max-w-6xl w-full flex flex-col h-[calc(100vh-4rem)]">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
           <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
            SF
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Synthetic Forge</h1>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
          
          {/* Toolbar */}
          <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white">
            <h2 className="text-lg font-semibold text-slate-700">Projects</h2>
            
            <div className="flex items-center gap-2">
              {/* Create Button */}
              <div className="relative group">
                <button 
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="p-2 text-slate-600 hover:text-primary hover:bg-blue-50 rounded-lg transition-colors"
                  aria-label="Create New Project"
                >
                  <Plus size={20} className="pointer-events-none" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  Create New Project
                </div>
              </div>

              <div className="w-px h-6 bg-slate-200 mx-1"></div>

              {/* Delete Button */}
              <div className="relative group">
                <button 
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={!selectedProjectId}
                  className={`p-2 rounded-lg transition-colors ${
                    !selectedProjectId 
                      ? 'text-slate-300 cursor-not-allowed' 
                      : 'text-slate-600 hover:text-red-600 hover:bg-red-50'
                  }`}
                  aria-label="Delete Project"
                >
                  <Trash2 size={20} className="pointer-events-none" />
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  Delete Project
                </div>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Name</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-32 text-center">Tables</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-32 text-center">Relations</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 w-48 text-right">Last Modified</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <FolderOpen size={48} className="text-slate-200" />
                        <p>No projects found.</p>
                        <button 
                          onClick={() => setIsCreating(true)}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Create your first project
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedProjects.map(project => {
                    const isSelected = selectedProjectId === project.id;
                    return (
                      <tr 
                        key={project.id}
                        onClick={() => handleRowClick(project.id)}
                        onDoubleClick={() => handleRowDoubleClick(project)}
                        className={`cursor-pointer transition-colors group ${
                          isSelected 
                            ? 'bg-blue-50/50 hover:bg-blue-50' 
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-6 py-4 border-b border-slate-50">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-primary'
                            }`}>
                              <Database size={16} />
                            </div>
                            <div>
                              <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>{project.name}</span>
                              <div className="text-[10px] text-slate-400 block sm:hidden">
                                {new Date(project.lastModified).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-slate-600 border-b border-slate-50">
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            {project.state.tables.length}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm text-slate-600 border-b border-slate-50">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                            <Network size={10} />
                            {project.state.relationships.length}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-slate-500 border-b border-slate-50">
                          <div className="flex items-center justify-end gap-1.5">
                            <Clock size={14} className="text-slate-300" />
                            {new Date(project.lastModified).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                            <span className="text-xs text-slate-300 ml-1">
                               {new Date(project.lastModified).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit'})}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="h-8 bg-slate-50 border-t border-slate-200 px-6 flex items-center justify-between text-xs text-slate-400">
             <span>{sortedProjects.length} Projects</span>
             <span>Double-click to open</span>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Create New Project</h3>
            <form onSubmit={handleCreate}>
              <input 
                autoFocus
                type="text" 
                placeholder="Project Name (e.g. Aerospace Parts)" 
                className="w-full border border-slate-300 rounded-lg px-4 py-2 mb-6 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={!newProjectName.trim()}
                  className="px-6 py-2 bg-primary hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Delete Project?</h3>
            </div>
            
            <p className="text-slate-600 mb-6 leading-relaxed">
              Are you sure you want to delete this project? This action cannot be undone and all data will be lost.
            </p>
            
            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                onClick={cancelDelete}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};