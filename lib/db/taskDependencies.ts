import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type TaskDependency = {
  id: string
  task_id: string
  depends_on_id: string
  created_at: string
}

export function addDependency(db: Database, taskId: string, dependsOnId: string): void {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO task_dependencies (id, task_id, depends_on_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(id, taskId, dependsOnId, now)
}

export function removeDependency(db: Database, taskId: string, dependsOnId: string): void {
  db.prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?')
    .run(taskId, dependsOnId)
}

export function getTaskDependencies(
  db: Database,
  taskId: string,
  direction: 'incoming' | 'outgoing'
): TaskDependency[] {
  if (direction === 'incoming') {
    return db.prepare(
      'SELECT * FROM task_dependencies WHERE task_id = ? ORDER BY created_at DESC'
    ).all(taskId) as TaskDependency[]
  } else {
    return db.prepare(
      'SELECT * FROM task_dependencies WHERE depends_on_id = ? ORDER BY created_at DESC'
    ).all(taskId) as TaskDependency[]
  }
}

export function isTaskBlocked(db: Database, taskId: string): boolean {
  const blocked = db.prepare(
    `SELECT COUNT(*) as count FROM task_dependencies
     WHERE task_id = ? AND depends_on_id IN (
       SELECT id FROM tasks WHERE status != 'done'
     )`
  ).get(taskId) as { count: number }
  return blocked.count > 0
}
