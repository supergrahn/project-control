import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type GlobalSettings = {
  git_root: string | null
}

export function useGlobalSettings() {
  return useQuery<GlobalSettings>({
    queryKey: ['global-settings'],
    queryFn: () => fetch('/api/settings').then((r) => {
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    }),
  })
}

export function useUpdateGlobalSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (settings: Partial<GlobalSettings>) =>
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).then(async (r) => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error ?? r.statusText)
        return json
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['global-settings'] })
      qc.invalidateQueries({ queryKey: ['scan'] })
    },
  })
}
