import { useQuery } from '@tanstack/react-query'
import type { TimelineEntry } from '@/lib/timeline'

export function useTimeline() {
  return useQuery<{ timeline: TimelineEntry[] }>({
    queryKey: ['timeline'],
    queryFn: async () => {
      const r = await fetch('/api/timeline')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}
