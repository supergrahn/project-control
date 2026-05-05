// lib/briefing/openNextActions.ts
import type { Database } from 'better-sqlite3'
import type { BriefingNextAction } from './types'

export function getOpenNextActions(db: Database, options: { now?: Date; limit?: number; lookbackDays?: number; projectId?: string } = {}): BriefingNextAction[] {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 10
  const lookbackDays = options.lookbackDays ?? 14
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000).toISOString()

  // Over-fetch by 3x to absorb rows with empty arrays that get skipped below;
  // bounded at a reasonable floor so the SQL cost stays predictable.
  const fetchCap = Math.max(limit * 3, 30)
  const whereProject = options.projectId ? 'AND s.project_id = ?' : ''
  const rows = db.prepare(`
    SELECT s.id, s.label, s.project_id, p.name AS project_name,
           s.task_id, s.source_file, s.ended_at, s.next_actions
      FROM sessions s
      JOIN projects p ON p.id = s.project_id
     WHERE s.status != 'active'
       AND s.next_actions IS NOT NULL
       AND s.ended_at IS NOT NULL
       AND s.ended_at > ?
       ${whereProject}
     ORDER BY s.ended_at DESC
     LIMIT ?
  `).all(...(options.projectId ? [cutoff, options.projectId, fetchCap] : [cutoff, fetchCap])) as Array<{
    id: string; label: string; project_id: string; project_name: string;
    task_id: string | null; source_file: string | null; ended_at: string; next_actions: string;
  }>

  const out: BriefingNextAction[] = []
  for (const row of rows) {
    let parsed: { next_actions?: unknown; open_questions?: unknown }
    try { parsed = JSON.parse(row.next_actions) } catch { continue }
    const actions = Array.isArray(parsed.next_actions)
      ? parsed.next_actions.filter((x): x is string => typeof x === 'string').slice(0, 3)
      : []
    const openQuestions = Array.isArray(parsed.open_questions)
      ? parsed.open_questions.filter((x): x is string => typeof x === 'string').slice(0, 3)
      : []
    if (actions.length === 0 && openQuestions.length === 0) continue
    out.push({
      sessionId: row.id,
      sessionLabel: row.label,
      projectId: row.project_id,
      projectName: row.project_name,
      taskId: row.task_id,
      sourceFile: row.source_file,
      endedAt: row.ended_at,
      actions,
      openQuestions,
    })
    if (out.length >= limit) break
  }
  return out
}
