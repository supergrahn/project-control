'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type Project = {
  id: string; name: string; path: string
  ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null
  last_used_at: string | null
  provider_id: string | null
}

export type ScannedFolder = { name: string; path: string }

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => {
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    }),
  })
}

export function useScanFolders() {
  return useQuery<ScannedFolder[]>({
    queryKey: ['scan'],
    queryFn: () => fetch('/api/projects/scan').then((r) => {
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    }),
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

export function useTouchProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/projects/${id}/touch`, { method: 'POST' }).then((r) => r.json()),
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

type TabState = { openProjects: Project[]; activeProjectId: string | null }

type ProjectContextType = {
  openProjects: Project[]
  activeProjectId: string | null
  selectedProject: Project | null
  openProject: (p: Project) => void
  closeProject: (id: string) => void
}

const ProjectContext = createContext<ProjectContextType>({
  openProjects: [],
  activeProjectId: null,
  selectedProject: null,
  openProject: () => {},
  closeProject: () => {},
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<TabState>({ openProjects: [], activeProjectId: null })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('project-tabs')
      if (raw) setTabs(JSON.parse(raw))
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('project-tabs', JSON.stringify(tabs))
  }, [tabs, hydrated])

  const openProject = useCallback((p: Project) => {
    setTabs((prev) => ({
      openProjects: prev.openProjects.find((x) => x.id === p.id)
        ? prev.openProjects.map((x) => (x.id === p.id ? p : x))
        : [...prev.openProjects, p],
      activeProjectId: p.id,
    }))
  }, [])

  const closeProject = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.openProjects.filter((p) => p.id !== id)
      let newActive = prev.activeProjectId
      if (prev.activeProjectId === id) {
        const idx = prev.openProjects.findIndex((p) => p.id === id)
        newActive = next.length > 0 ? next[Math.max(0, idx - 1)].id : null
      }
      return { openProjects: next, activeProjectId: newActive }
    })
  }, [])

  const selectedProject = tabs.openProjects.find((p) => p.id === tabs.activeProjectId) ?? null

  return (
    <ProjectContext.Provider value={{
      openProjects: tabs.openProjects,
      activeProjectId: tabs.activeProjectId,
      selectedProject,
      openProject,
      closeProject,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectStore() {
  return useContext(ProjectContext)
}
