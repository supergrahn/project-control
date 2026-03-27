import { useQuery } from '@tanstack/react-query'
import type { TechAuditReport } from '@/lib/tech-audit'

export function useTechAudit() {
  return useQuery<TechAuditReport>({
    queryKey: ['tech-audit'],
    queryFn: async () => {
      const r = await fetch('/api/tech-audit')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}
