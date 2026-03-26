// hooks/useAudit.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type AuditStatus = {
  blockers: number
  warnings: number
  auditFile: string
  auditedAt: string
}

export function useAuditStatus(projectId: string | null) {
  return useQuery<Record<string, AuditStatus>>({
    queryKey: ['audit-status', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/memory/audit-status?projectId=${projectId}`)
      if (!r.ok) return {}
      return r.json()
    },
    enabled: !!projectId,
  })
}

export function useRunAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; planFile: string }) =>
      fetch('/api/sessions/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['audit-status', vars.projectId] })
    },
  })
}
