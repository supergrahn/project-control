// hooks/useMemory.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export type MemoryFile = {
  filename: string
  path: string
  name: string
  description: string
  type: MemoryType
  content: string
  modifiedAt: string
}

export function useMemory(projectId: string | null) {
  return useQuery<MemoryFile[] | null>({
    queryKey: ['memory', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/memory?projectId=${projectId}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json() as Promise<MemoryFile[] | null>
    },
    enabled: !!projectId,
  })
}

export function useUpdateMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; filename: string; content: string }) =>
      fetch(`/api/memory?projectId=${vars.projectId}&filename=${encodeURIComponent(vars.filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: vars.content }),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['memory', vars.projectId] }),
  })
}

export function useDeleteMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; filename: string }) =>
      fetch(`/api/memory?projectId=${vars.projectId}&filename=${encodeURIComponent(vars.filename)}`, {
        method: 'DELETE',
      }).then(r => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['memory', vars.projectId] }),
  })
}
