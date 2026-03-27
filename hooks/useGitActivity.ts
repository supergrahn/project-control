import { useQuery } from '@tanstack/react-query'
import type { ProjectGitActivity } from '@/lib/git-activity'

export function useGitActivity() {
  return useQuery<{ projects: ProjectGitActivity[] }>({
    queryKey: ['git-activity'],
    queryFn: async () => {
      const r = await fetch('/api/git-activity')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    refetchInterval: 60000, // refresh every minute
  })
}
