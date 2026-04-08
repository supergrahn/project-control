import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getTaskSourceConfig, listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { createTask, updateTask } from '@/lib/db/tasks'
import type { Task } from '@/lib/db/tasks'

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  error?: string
}

export async function syncProjectSource(
  db: Database,
  projectId: string,
  adapterKey: string,
): Promise<SyncResult> {
  const config = getTaskSourceConfig(db, projectId, adapterKey)
  if (!config) throw new Error(`No config for ${adapterKey} on project ${projectId}`)

  const adapter = getTaskSourceAdapter(adapterKey)

  try {
    const externalTasks = await adapter.fetchTasks(config.config, config.resource_ids)

    const existingTasks = db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND source = ?'
    ).all(projectId, adapterKey) as Task[]

    const existingBySourceId = new Map(existingTasks.map(t => [t.source_id, t]))

    let created = 0, updated = 0
    const seenSourceIds = new Set<string>()

    for (const ext of externalTasks) {
      seenSourceIds.add(ext.sourceId)
      const existing = existingBySourceId.get(ext.sourceId)
      const mappedStatus = adapter.mapStatus(ext.status)
      const mappedPriority = adapter.mapPriority(ext.priority)

      if (existing) {
        updateTask(db, existing.id, {
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : null,
          idea_file: ext.description,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
          status: mappedStatus,
        })
        updated++
      } else {
        const task = createTask(db, {
          id: randomUUID(),
          projectId,
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : undefined,
        })
        updateTask(db, task.id, {
          source: adapterKey,
          source_id: ext.sourceId,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
          idea_file: ext.description,
          status: mappedStatus,
        })
        created++
      }
    }

    let deleted = 0
    const incomingIds = Array.from(seenSourceIds)
    const now = new Date().toISOString()

    if (incomingIds.length === 0) {
      // No tasks returned — soft-delete all tasks for this project+source
      const result = db.prepare(
        `UPDATE tasks SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND source = ? AND is_deleted = 0`
      ).run(now, projectId, adapterKey)
      deleted = result.changes
    } else {
      const placeholders = incomingIds.map(() => '?').join(', ')
      // Soft-delete tasks that no longer appear in the sync result
      const deleteResult = db.prepare(`
        UPDATE tasks SET is_deleted = 1, updated_at = ?
        WHERE project_id = ? AND source = ? AND source_id NOT IN (${placeholders}) AND is_deleted = 0
      `).run(now, projectId, adapterKey, ...incomingIds)
      deleted = deleteResult.changes

      // Un-delete tasks that reappear
      db.prepare(`
        UPDATE tasks SET is_deleted = 0, updated_at = ?
        WHERE project_id = ? AND source = ? AND source_id IN (${placeholders})
      `).run(now, projectId, adapterKey, ...incomingIds)
    }

    // Upsert comments from all tasks
    const insertComment = db.prepare(`
      INSERT OR IGNORE INTO task_comments
        (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertAllComments = db.transaction(() => {
      for (const ext of externalTasks) {
        for (const comment of ext.comments ?? []) {
          insertComment.run(
            randomUUID(),
            projectId,
            adapterKey,
            ext.sourceId,
            comment.id,
            comment.author ?? '',
            comment.body ?? '',
            comment.createdAt,
            now,
          )
        }
      }
    })
    insertAllComments()

    db.prepare(
      'UPDATE task_source_config SET last_synced_at = ?, last_error = NULL WHERE project_id = ? AND adapter_key = ?'
    ).run(new Date().toISOString(), projectId, adapterKey)

    return { created, updated, deleted }
  } catch (err: any) {
    const errorMsg = err?.message || String(err)
    db.prepare(
      'UPDATE task_source_config SET last_error = ? WHERE project_id = ? AND adapter_key = ?'
    ).run(errorMsg, projectId, adapterKey)
    return { created: 0, updated: 0, deleted: 0, error: errorMsg }
  }
}

export async function syncProject(
  db: Database,
  projectId: string,
): Promise<SyncResult[]> {
  const configs = listTaskSourceConfigs(db, projectId)
  return Promise.all(
    configs
      .filter(c => c.is_active)
      .map(c => syncProjectSource(db, projectId, c.adapter_key))
  )
}
