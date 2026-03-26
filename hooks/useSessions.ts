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
    queryFn: () => fetch('/api/sessions').then((r) => r.json()),
    refetchInterval: 5000,
  })
}

export function useKillSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}
