import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getTaskSourceConfig, listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { createTask, updateTask } from '@/lib/db/tasks'
import type { Task } from '@/lib/db/tasks'
import { prepareTask } from '@/lib/prep/prepareTask'

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  error?: string
}

// Limit concurrent prepareTask invocations after a sync. A bulk sync of 50
// tasks would otherwise fan out 50 concurrent localComplete (LLM) calls,
// which a local single-process Ollama/llama.cpp server cannot service in
// parallel. Concurrency 2 keeps the local provider busy without thrashing.
async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  limit: number,
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const myIdx = i++
      try {
        await tasks[myIdx]()
      } catch {
        // swallowed; prepareTask handles its own failures and writes status='failed'
      }
    }
  })
  await Promise.all(workers)
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

    // Collect task ids that need prepping during the transaction; fire the
    // actual prepareTask calls AFTER the tx commits, throttled via
    // runWithConcurrency so a bulk sync doesn't stampede the local LLM.
    const idsToPrep: string[] = []
    const { created, updated, deleted } = db.transaction(() => {
      const existingTasks = db.prepare(
        'SELECT * FROM tasks WHERE project_id = ? AND source = ? AND (is_deleted = 0 OR is_deleted IS NULL)'
      ).all(projectId, adapterKey) as Task[]

      const existingBySourceId = new Map(existingTasks.map(t => [t.source_id, t]))

      let created = 0, updated = 0
      const seenSourceIds = new Set<string>()
      const now = new Date().toISOString()

      for (const ext of externalTasks) {
        seenSourceIds.add(ext.sourceId)
        const existing = existingBySourceId.get(ext.sourceId)
        const mappedStatus = adapter.mapStatus(ext.status)
        const mappedPriority = adapter.mapPriority(ext.priority)

        if (existing) {
          const titleChanged = existing.title !== ext.title
          const descChanged = (existing.idea_file ?? '') !== (ext.description ?? '')
          updateTask(db, existing.id, {
            title: ext.title,
            priority: mappedPriority,
            labels: ext.labels.length > 0 ? ext.labels : null,
            idea_file: ext.description,
            source_url: ext.url,
            source_meta: JSON.stringify(ext.meta),
            status: mappedStatus,
          })
          if (titleChanged || descChanged) {
            idsToPrep.push(existing.id)
          }
          updated++
        } else {
          const softDeleted = db.prepare(
            'SELECT id FROM tasks WHERE project_id = ? AND source = ? AND source_id = ? AND is_deleted = 1'
          ).get(projectId, adapterKey, ext.sourceId) as { id: string } | undefined

          if (softDeleted) {
            db.prepare(`UPDATE tasks SET is_deleted = 0 WHERE id = ?`).run(softDeleted.id)
            updateTask(db, softDeleted.id, {
              title: ext.title,
              status: mappedStatus,
              priority: mappedPriority,
              labels: ext.labels.length > 0 ? ext.labels : null,
              source_url: ext.url,
              source_meta: JSON.stringify(ext.meta),
              idea_file: ext.description,
            })
            idsToPrep.push(softDeleted.id)
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
            idsToPrep.push(task.id)
            created++
          }
        }
      }

      let deleted = 0
      const incomingIds = Array.from(seenSourceIds)

      if (incomingIds.length === 0) {
        const result = db.prepare(
          `UPDATE tasks SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND source = ? AND is_deleted = 0`
        ).run(now, projectId, adapterKey)
        deleted = result.changes
      } else {
        const placeholders = incomingIds.map(() => '?').join(', ')
        const deleteResult = db.prepare(`
          UPDATE tasks SET is_deleted = 1, updated_at = ?
          WHERE project_id = ? AND source = ? AND source_id NOT IN (${placeholders}) AND is_deleted = 0
        `).run(now, projectId, adapterKey, ...incomingIds)
        deleted = deleteResult.changes
      }

      // Upsert comments (inline — no inner transaction needed)
      const insertComment = db.prepare(`
        INSERT INTO task_comments
          (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source, task_source_id, comment_id) DO UPDATE SET
          author    = excluded.author,
          body      = excluded.body,
          synced_at = excluded.synced_at
      `)
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

      db.prepare(
        'UPDATE task_source_config SET last_synced_at = ?, last_error = NULL WHERE project_id = ? AND adapter_key = ?'
      ).run(new Date().toISOString(), projectId, adapterKey)

      return { created, updated, deleted }
    })()

    // Fire-and-forget: keep sync return prompt while throttling LLM fanout.
    // prepareTask owns its own status writes and recency guard, so workers
    // running after the tx commit is the documented contract.
    if (idsToPrep.length > 0) {
      void runWithConcurrency(
        idsToPrep.map((id) => () => prepareTask(db, id)),
        2,
      )
    }

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
