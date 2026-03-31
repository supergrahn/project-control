import { mutate as globalMutate } from 'swr'

export async function stopSession(sessionId: string): Promise<void> {
  const r = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  if (!r.ok) return
  await globalMutate((key: unknown) => typeof key === 'string' && key.includes('/api/sessions'))
}
