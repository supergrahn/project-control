import { useQuery } from '@tanstack/react-query'
import type { UsageReport } from '@/lib/usage'

export function useUsage(period: 'week' | 'month' = 'week') {
  return useQuery<UsageReport>({
    queryKey: ['usage', period],
    queryFn: async () => {
      const r = await fetch(`/api/usage?period=${period}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}
