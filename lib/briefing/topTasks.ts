import type { Database } from 'better-sqlite3'
import type { BriefingTopTask } from './types'

export function getTopTasks(db: Database, options: { limit?: number } = {}): BriefingTopTask[] {
  const limit = options.limit ?? 10
  const rows = db.prepare(`
    SELECT t.id, t.project_id, p.name AS project_name, t.title, t.status, t.created_at
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
     WHERE t.status IN ('idea','spec','plan')
     ORDER BY (CASE t.status WHEN 'plan' THEN 0 WHEN 'spec' THEN 1 ELSE 2 END), t.created_at DESC
     LIMIT ?
  `).all(limit) as Array<{ id: string; project_id: string; project_name: string; title: string; status: string; created_at: string }>
  return rows.map(r => ({
    taskId: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
  }))
}
