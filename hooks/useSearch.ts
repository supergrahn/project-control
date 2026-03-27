import { useQuery } from '@tanstack/react-query'
import type { SearchResult } from '@/lib/search'

export function useSearch(query: string, projectId?: string) {
  return useQuery<{ results: SearchResult[] }>({
    queryKey: ['search', query, projectId],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query })
      if (projectId) params.set('projectId', projectId)
      const r = await fetch(`/api/search?${params}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    enabled: query.trim().length >= 2,
  })
}
