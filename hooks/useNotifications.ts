import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type NotificationData = {
  unreadCount: number
  events: Array<{ id: string; projectId: string | null; type: string; summary: string; severity: string; createdAt: string }>
}

export function useNotifications() {
  return useQuery<NotificationData>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const r = await fetch('/api/notifications')
      if (!r.ok) throw new Error(r.statusText)
      return r.json()
    },
    refetchInterval: 15000,
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { eventId?: string; markAll?: boolean }) =>
      fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vars) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
