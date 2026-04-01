import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getTaskSourceConfig } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { createTask, updateTask, setTaskStatus, deleteTask, getTask } from '@/lib/db/tasks'
import type { Task } from '@/lib/db/tasks'

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  error?: string
}

export async function syncProject(db: Database, projectId: string): Promise<SyncResult> {
  const config = getTaskSourceConfig(db, projectId)
  if (!config) throw new Error(`No task source configured for project ${projectId}`)

  const adapter = getTaskSourceAdapter(config.adapter_key)

  try {
    const externalTasks = await adapter.fetchTasks(config.config)

    // Get existing synced tasks for this project+source
    const existingTasks = db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND source = ?'
    ).all(projectId, adapter.key) as Task[]

    const existingBySourceId = new Map(
      existingTasks.map(t => [t.source_id, t])
    )

    let created = 0
    let updated = 0
    const seenSourceIds = new Set<string>()

    for (const ext of externalTasks) {
      seenSourceIds.add(ext.sourceId)
      const existing = existingBySourceId.get(ext.sourceId)
      const mappedStatus = adapter.mapStatus(ext.status)
      const mappedPriority = adapter.mapPriority(ext.priority)

      if (existing) {
        // Update source-managed fields only
        updateTask(db, existing.id, {
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : null,
          idea_file: ext.description,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
        })
        setTaskStatus(db, existing.id, mappedStatus)
        updated++
      } else {
        // Create new task
        const task = createTask(db, {
          id: randomUUID(),
          projectId,
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : undefined,
        })
        // Set source fields and status via updateTask
        updateTask(db, task.id, {
          source: adapter.key,
          source_id: ext.sourceId,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
          idea_file: ext.description,
        })
        setTaskStatus(db, task.id, mappedStatus)
        created++
      }
    }

    // Delete tasks no longer in the external source
    let deleted = 0
    for (const existing of existingTasks) {
      if (existing.source_id && !seenSourceIds.has(existing.source_id)) {
        deleteTask(db, existing.id)
        deleted++
      }
    }

    // Update sync metadata
    db.prepare(
      'UPDATE task_source_config SET last_synced_at = ?, last_error = NULL WHERE project_id = ?'
    ).run(new Date().toISOString(), projectId)

    return { created, updated, deleted }
  } catch (err: any) {
    const errorMsg = err?.message || String(err)
    db.prepare(
      'UPDATE task_source_config SET last_error = ? WHERE project_id = ?'
    ).run(errorMsg, projectId)
    return { created: 0, updated: 0, deleted: 0, error: errorMsg }
  }
}
