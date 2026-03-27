import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type Template = { id: string; name: string; description: string | null; dirs: string; created_at: string }

export function useTemplates() {
  return useQuery<Template[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const r = await fetch('/api/templates')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
  })
}

export function useCreateTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { name: string; description?: string; dirs: { ideas_dir?: string; specs_dir?: string; plans_dir?: string } }) =>
      fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}

export function useDeleteTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/templates?id=${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })
}
