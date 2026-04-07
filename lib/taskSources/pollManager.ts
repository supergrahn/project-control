import { getDb } from '@/lib/db'
import { listActiveTaskSources } from '@/lib/db/taskSourceConfig'
import { syncProjectSource } from '@/lib/taskSources/syncService'
import { logEvent } from '@/lib/events'

const POLL_INTERVAL_MS = 60_000

declare global {
  var pollTimers: Map<string, ReturnType<typeof setInterval>> | undefined
}

function getTimers(): Map<string, ReturnType<typeof setInterval>> {
  if (!globalThis.pollTimers) globalThis.pollTimers = new Map()
  return globalThis.pollTimers
}

function timerKey(projectId: string, adapterKey: string): string {
  return `${projectId}:${adapterKey}`
}

export function startPolling(projectId: string, adapterKey: string): void {
  const timers = getTimers()
  const key = timerKey(projectId, adapterKey)
  if (timers.has(key)) return

  const timer = setInterval(async () => {
    try {
      const db = getDb()
      const result = await syncProjectSource(db, projectId, adapterKey)
      if (result.error) {
        logEvent(db, { projectId, type: 'task_sync', summary: `[${adapterKey}] Sync failed: ${result.error}`, severity: 'warn' })
      } else if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
        logEvent(db, { projectId, type: 'task_sync', summary: `[${adapterKey}] Synced: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`, severity: 'info' })
      }
    } catch (err) {
      console.error(`[poll] sync failed for ${projectId}:${adapterKey}:`, err)
    }
  }, POLL_INTERVAL_MS)

  timers.set(key, timer)
  console.log(`[poll] started polling for ${projectId}:${adapterKey}`)
}

export function stopPolling(projectId: string, adapterKey: string): void {
  const timers = getTimers()
  const key = timerKey(projectId, adapterKey)
  const timer = timers.get(key)
  if (timer) {
    clearInterval(timer)
    timers.delete(key)
    console.log(`[poll] stopped polling for ${projectId}:${adapterKey}`)
  }
}

export function stopAllPolling(): void {
  const timers = getTimers()
  for (const [key, timer] of timers) {
    clearInterval(timer)
    console.log(`[poll] stopped polling for ${key}`)
  }
  timers.clear()
}

export function startAllPolling(): void {
  try {
    const db = getDb()
    const activeSources = listActiveTaskSources(db)
    for (const source of activeSources) {
      startPolling(source.project_id, source.adapter_key)
    }
    if (activeSources.length > 0) {
      console.log(`[poll] started polling for ${activeSources.length} source(s)`)
    }
  } catch (err) {
    console.error('[poll] failed to start polling:', err)
  }
}
