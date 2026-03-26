import { useQuery } from '@tanstack/react-query'
import type { DashboardResponse } from '@/lib/dashboard'

export function useDashboard() {
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const r = await fetch('/api/dashboard')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    refetchInterval: 30000,
  })
}
