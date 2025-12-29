
import { Project } from '../types';

const STORAGE_KEY = 'synthetic_forge_projects';

export const getProjects = (): Project[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load projects", e);
    return [];
  }
};

export const saveProject = (project: Project) => {
  try {
    const projects = getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    const updatedProject = { ...project, lastModified: Date.now() };
    
    if (index >= 0) {
      projects[index] = updatedProject;
    } else {
      projects.push(updatedProject);
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error("Failed to save project", e);
  }
};

export const deleteProject = (id: string) => {
  try {
    const projects = getProjects().filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch (e) {
    console.error("Failed to delete project", e);
  }
};

export const createNewProject = (name: string): Project => {
  return {
    id: crypto.randomUUID(),
    name,
    lastModified: Date.now(),
    state: { tables: [], relationships: [], referenceFiles: [] },
    currentStep: 1
  };
};
