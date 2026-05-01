import { useQuery } from '@tanstack/react-query'

export type DocsTreeNode = {
  type: 'folder' | 'file'
  name: string
  relativePath: string
  size: number
  modifiedAt: string
  content?: string
  children?: DocsTreeNode[]
}

export type DocsTreeResponse = {
  nodes: DocsTreeNode[]
}

export function useDocsTree(projectId: string | null) {
  return useQuery<DocsTreeResponse>({
    queryKey: ['docs-tree', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/docs`)
      if (!res.ok) throw new Error(`Docs fetch failed: ${res.statusText}`)
      return res.json() as Promise<DocsTreeResponse>
    },
    enabled: !!projectId,
  })
}
