import type { Database } from 'better-sqlite3'
import type { TaskStatus } from '@/lib/types'
import { randomUUID } from 'crypto'

export type TaskStatusLogEntry = {
  id: string
  task_id: string
  from_status: TaskStatus
  to_status: TaskStatus
  changed_by: 'user' | 'sync' | 'session'
  reason: string | null
  created_at: string
}

export function logStatusChange(
  db: Database,
  taskId: string,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  changedBy: 'user' | 'sync' | 'session' = 'user',
  reason?: string
): void {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO task_status_log (id, task_id, from_status, to_status, changed_by, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, fromStatus, toStatus, changedBy, reason ?? null, now)
}

export function getTaskStatusLog(db: Database, taskId: string): TaskStatusLogEntry[] {
  return db.prepare(
    'SELECT * FROM task_status_log WHERE task_id = ? ORDER BY created_at DESC'
  ).all(taskId) as TaskStatusLogEntry[]
}
