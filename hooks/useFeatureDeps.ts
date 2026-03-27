import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type FeatureDep = { id: string; feature_key: string; depends_on_key: string; project_id: string; created_at: string }

export function useFeatureDeps(projectId: string | null) {
  return useQuery<FeatureDep[]>({
    queryKey: ['feature-deps', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/feature-deps?projectId=${projectId}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    enabled: !!projectId,
  })
}

export function useCreateFeatureDep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; featureKey: string; dependsOnKey: string }) =>
      fetch('/api/feature-deps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars) }).then(r => r.json()),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['feature-deps', vars.projectId] }),
  })
}

export function useDeleteFeatureDep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; projectId: string }) =>
      fetch(`/api/feature-deps?id=${vars.id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['feature-deps', vars.projectId] }),
  })
}
