import type { Database } from 'better-sqlite3'
import type { BriefingRecentFailure } from './types'

export function getRecentFailures(db: Database, options: { now?: Date; limit?: number; lookbackDays?: number } = {}): BriefingRecentFailure[] {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 10
  const lookbackDays = options.lookbackDays ?? 7
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString()

  const rows = db.prepare(`
    SELECT s.id, s.label, s.project_id, p.name AS project_name,
           s.grade, s.grade_reason, s.graded_at
      FROM sessions s
      JOIN projects p ON p.id = s.project_id
     WHERE s.grade IN ('no','partial')
       AND s.graded_at IS NOT NULL
       AND s.graded_at > ?
     ORDER BY s.graded_at DESC
     LIMIT ?
  `).all(cutoff, limit) as Array<{
    id: string; label: string; project_id: string; project_name: string;
    grade: string; grade_reason: string | null; graded_at: string;
  }>
  return rows.map(r => ({
    sessionId: r.id,
    sessionLabel: r.label,
    projectId: r.project_id,
    projectName: r.project_name,
    grade: r.grade as 'no' | 'partial',
    gradeReason: r.grade_reason,
    gradedAt: r.graded_at,
  }))
}
