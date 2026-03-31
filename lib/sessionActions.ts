import { mutate as globalMutate } from 'swr'

export async function stopSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  await globalMutate((key: unknown) => typeof key === 'string' && key.includes('/api/sessions'))
}
