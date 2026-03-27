import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type PlanItem = { projectId: string; projectName: string; featureName: string; filePath: string; stage: string }

export function useDailyPlan() {
  return useQuery<{ plan: { items: PlanItem[] } | null }>({
    queryKey: ['daily-plan'],
    queryFn: async () => {
      const r = await fetch('/api/daily-plan')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}

export function useSaveDailyPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: PlanItem[]) =>
      fetch('/api/daily-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['daily-plan'] }),
  })
}
