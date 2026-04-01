import { getDb } from '@/lib/db'
import { listActiveTaskSources } from '@/lib/db/taskSourceConfig'
import { syncProject } from '@/lib/taskSources/syncService'
import { logEvent } from '@/lib/events'

const POLL_INTERVAL_MS = 60_000  // 1 minute

// Use globalThis to survive Next.js hot-reload (same pattern as procMap in session-manager)
declare global {
  var pollTimers: Map<string, ReturnType<typeof setInterval>> | undefined
}

function getTimers(): Map<string, ReturnType<typeof setInterval>> {
  if (!globalThis.pollTimers) {
    globalThis.pollTimers = new Map()
  }
  return globalThis.pollTimers
}

export function startPolling(projectId: string): void {
  const timers = getTimers()
  // Don't start duplicate timers
  if (timers.has(projectId)) return

  const timer = setInterval(async () => {
    try {
      const db = getDb()
      const result = await syncProject(db, projectId)
      if (result.error) {
        logEvent(db, { projectId, type: 'task_sync', summary: `Sync failed: ${result.error}`, severity: 'warn' })
      } else if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
        logEvent(db, { projectId, type: 'task_sync', summary: `Synced: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`, severity: 'info' })
      }
    } catch (err) {
      console.error(`[poll] sync failed for project ${projectId}:`, err)
    }
  }, POLL_INTERVAL_MS)

  timers.set(projectId, timer)
  console.log(`[poll] started polling for project ${projectId}`)
}

export function stopPolling(projectId: string): void {
  const timers = getTimers()
  const timer = timers.get(projectId)
  if (timer) {
    clearInterval(timer)
    timers.delete(projectId)
    console.log(`[poll] stopped polling for project ${projectId}`)
  }
}

export function stopAllPolling(): void {
  const timers = getTimers()
  for (const [projectId, timer] of timers) {
    clearInterval(timer)
    console.log(`[poll] stopped polling for project ${projectId}`)
  }
  timers.clear()
}

export function startAllPolling(): void {
  try {
    const db = getDb()
    const activeSources = listActiveTaskSources(db)
    for (const source of activeSources) {
      startPolling(source.project_id)
    }
    if (activeSources.length > 0) {
      console.log(`[poll] started polling for ${activeSources.length} project(s)`)
    }
  } catch (err) {
    console.error('[poll] failed to start polling:', err)
  }
}
