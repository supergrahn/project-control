import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useNote(filePath: string | null) {
  return useQuery<{ note: string | null }>({
    queryKey: ['note', filePath],
    queryFn: async () => {
      const r = await fetch(`/api/notes?filePath=${encodeURIComponent(filePath!)}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    enabled: !!filePath,
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { filePath: string; note: string }) =>
      fetch(`/api/notes?filePath=${encodeURIComponent(vars.filePath)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: vars.note }),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['note', vars.filePath] }),
  })
}
