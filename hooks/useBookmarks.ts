import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type Bookmark = { id: string; project_id: string | null; title: string; content: string; source_url: string | null; tags: string | null; created_at: string }

export function useBookmarks(projectId?: string) {
  return useQuery<Bookmark[]>({
    queryKey: ['bookmarks', projectId],
    queryFn: async () => {
      const params = projectId ? `?projectId=${projectId}` : ''
      const r = await fetch(`/api/bookmarks${params}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}

export function useCreateBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId?: string; title: string; content: string; sourceUrl?: string; tags?: string }) =>
      fetch('/api/bookmarks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  })
}

export function useDeleteBookmark() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/bookmarks?id=${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookmarks'] }),
  })
}
