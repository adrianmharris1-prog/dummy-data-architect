import React, { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import Editor from './Editor';
import { LifecycleManager } from './LifecycleManager';
import { Project } from './types';
import { getProjects, saveProject } from '../services/storageService';
import { Layers, Edit3 } from 'lucide-react';

export default function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeView, setActiveView] = useState<'editor' | 'lifecycles'>('editor');

  const loadProjects = () => {
    setProjects(getProjects());
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleSaveProject = (updatedProject: Project) => {
    saveProject(updatedProject);
    // Update local instance to keep React state synchronized
    setCurrentProject(updatedProject);
  };

  const handleCloseProject = () => {
    setCurrentProject(null);
    setActiveView('editor');
    loadProjects(); // Refresh list to show updated timestamps
  };

  const handleOpenProject = (project: Project) => {
    setCurrentProject(project);
    setActiveView('editor');
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50">
      {/* Top Application Bar - Persistent across sub-views when a project is open */}
      {currentProject && (
        <div className="h-12 bg-slate-900 border-b border-white/10 flex items-center px-6 gap-8 z-[60] shrink-0 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-inner">SF</div>
            <span className="text-white font-black text-xs tracking-tighter uppercase opacity-80">SYNTHETIC FORGE</span>
          </div>

          <div className="w-px h-4 bg-white/10"></div>

          <nav className="flex items-center gap-1.5">
            <button 
              onClick={() => setActiveView('editor')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider ${
                activeView === 'editor' 
                  ? 'bg-white/10 text-white' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <Edit3 size={14} />
              Schema Editor
            </button>
            <button 
              onClick={() => setActiveView('lifecycles')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all uppercase tracking-wider ${
                activeView === 'lifecycles' 
                  ? 'bg-white/10 text-white shadow-inner' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <Layers size={14} />
              Lifecycles
            </button>
          </nav>

          <div className="ml-auto text-white/30 text-[9px] font-black tracking-widest uppercase truncate max-w-[200px]">
            ACTIVE PROJECT: {currentProject.name}
          </div>
        </div>
      )}

      {/* Main View Area */}
      <div className="flex-1 relative overflow-hidden">
        {!currentProject ? (
          <Dashboard 
            projects={projects} 
            onOpenProject={handleOpenProject}
            onProjectsChange={loadProjects}
          />
        ) : activeView === 'editor' ? (
          <Editor 
            project={currentProject} 
            onSave={handleSaveProject} 
            onBack={handleCloseProject} 
          />
        ) : (
          <LifecycleManager 
            project={currentProject}
            onSave={handleSaveProject}
            onClose={() => setActiveView('editor')}
          />
        )}
      </div>
    </div>
  );
}