import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type SessionState = {
  sessionId: string | null
  logId: string | null
}

export type MarkdownFile = {
  filename: string
  path: string
  title: string
  excerpt: string
  modifiedAt: string
  content: string
  sessions: {
    ideate: SessionState
    spec: SessionState
    plan: SessionState
    develop: SessionState
  }
}

// null means the directory is not configured (422); [] means configured but empty
export function useFiles(projectId: string | null, dir: 'ideas' | 'specs' | 'plans' | 'developing') {
  return useQuery<MarkdownFile[] | null>({
    queryKey: ['files', projectId, dir],
    queryFn: async () => {
      const r = await fetch(`/api/files?projectId=${projectId}&dir=${dir}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json() as Promise<MarkdownFile[] | null>
    },
    enabled: !!projectId,
  })
}

export function useCreateFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { projectId: string; dir: string; name: string; pitch?: string }) =>
      fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['files', vars.projectId, vars.dir] }),
  })
}

export function usePromoteFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { projectId: string; sourceFile: string; targetDir: string }) =>
      fetch('/api/files/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['files', vars.projectId, vars.targetDir] }),
  })
}
