import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type ContextPack = {
  id: string
  project_id: string
  title: string
  content: string
  source_url: string | null
  created_at: string
  updated_at: string
}

export function useContextPacks(projectId: string | null) {
  return useQuery<ContextPack[]>({
    queryKey: ['context-packs', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/context-packs?projectId=${projectId}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    enabled: !!projectId,
  })
}

export function useCreateContextPack() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; title: string; content: string; sourceUrl?: string }) =>
      fetch('/api/context-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }).then(r => r.json()),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['context-packs', vars.projectId] }),
  })
}

export function useDeleteContextPack() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) =>
      fetch(`/api/context-packs?id=${vars.id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['context-packs', vars.projectId] }),
  })
}
