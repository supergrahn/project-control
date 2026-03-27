import { useQuery } from '@tanstack/react-query'
import type { Insight } from '@/lib/db'

export function useInsights(projectId?: string) {
  return useQuery<{ insights: Insight[] }>({
    queryKey: ['insights', projectId],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : ''
      const r = await fetch(`/api/insights${params}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}
