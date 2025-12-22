import React, { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import Editor from './Editor';
import { Project } from './types';
import { getProjects, saveProject } from './services/storageService';

export default function App() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  const loadProjects = () => {
    setProjects(getProjects());
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleSaveProject = (updatedProject: Project) => {
    saveProject(updatedProject);
    // Update local list slightly out of sync or just reload when going back
    // For now, we update the current instance to keep React happy
    setCurrentProject(updatedProject);
  };

  const handleCloseProject = () => {
    setCurrentProject(null);
    loadProjects(); // Refresh list to show updated timestamps
  };

  return (
    <div className="h-screen w-screen">
      {currentProject ? (
        <Editor 
          project={currentProject} 
          onSave={handleSaveProject} 
          onBack={handleCloseProject} 
        />
      ) : (
        <Dashboard 
          projects={projects} 
          onOpenProject={setCurrentProject}
          onProjectsChange={loadProjects}
        />
      )}
    </div>
  );
}