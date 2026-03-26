'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useState, type ReactNode } from 'react'

export type Project = {
  id: string; name: string; path: string
  ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null
}

export type ScannedFolder = { name: string; path: string }

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
  })
}

export function useScanFolders() {
  return useQuery<ScannedFolder[]>({
    queryKey: ['scan'],
    queryFn: () => fetch('/api/projects/scan').then((r) => r.json()),
  })
}

export function useAddProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; path: string }) =>
      fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Record<string, string | null> }) =>
      fetch(`/api/projects/${id}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

type ProjectContextType = {
  selectedProject: Project | null
  setSelectedProject: (p: Project) => void
}

const ProjectContext = createContext<ProjectContextType>({
  selectedProject: null,
  setSelectedProject: () => {},
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectStore() {
  return useContext(ProjectContext)
}
