import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type MarkdownFile = {
  filename: string
  path: string
  title: string
  excerpt: string
  modifiedAt: string
  content: string
}

export function useFiles(projectId: string | null, dir: 'ideas' | 'specs' | 'plans') {
  return useQuery<MarkdownFile[]>({
    queryKey: ['files', projectId, dir],
    queryFn: () => fetch(`/api/files?projectId=${projectId}&dir=${dir}`).then((r) => {
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    }),
    enabled: !!projectId,
  })
}

export function useCreateFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { projectId: string; dir: string; name: string }) =>
      fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['files', vars.projectId, vars.dir] }),
  })
}
