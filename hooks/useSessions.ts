import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type Session = {
  id: string
  project_id: string
  label: string
  phase: string
  source_file: string | null
  status: string
  created_at: string
}

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then((r) => {
      if (!r.ok) throw new Error(`Sessions fetch failed: ${r.statusText}`)
      return r.json()
    }),
    refetchInterval: 5000,
  })
}

export function useKillSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }).then((r) => {
        if (!r.ok) throw new Error(`Kill session failed: ${r.statusText}`)
        return r
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}

export function useLaunchSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      projectId: string
      phase: string
      sourceFile: string | null
      userContext?: string
      permissionMode?: string
    }) =>
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const json = await r.json()
        if (!r.ok && r.status !== 409) throw new Error(json.error ?? r.statusText)
        return json
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}
