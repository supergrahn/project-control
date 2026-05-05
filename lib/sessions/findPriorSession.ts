import type { Database } from 'better-sqlite3'
import type { Session } from '@/lib/db'
import { parseNextActions } from './nextActionsContext'

export type PriorSessionLookup = { taskId?: string | null; sourceFile?: string | null }

export function findPriorSessionWithNextActions(db: Database, lookup: PriorSessionLookup): Session | null {
  const conditions: string[] = ["status != 'active'", 'next_actions IS NOT NULL']
  const params: unknown[] = []
  if (lookup.sourceFile) {
    conditions.push('source_file = ?')
    params.push(lookup.sourceFile)
  } else if (lookup.taskId) {
    conditions.push('task_id = ?')
    params.push(lookup.taskId)
  } else {
    return null
  }
  // ORDER: ended_at DESC NULLS LAST then created_at DESC. ISO 8601 strings sort
  // lexicographically the same as chronologically, so a plain DESC works.
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE ${conditions.join(' AND ')} ORDER BY ended_at IS NULL, ended_at DESC, created_at DESC LIMIT 5`,
    )
    .all(...params) as Session[]
  for (const row of rows) {
    const parsed = parseNextActions(row)
    if (parsed && (parsed.next_actions.length > 0 || parsed.open_questions.length > 0)) return row
  }
  return null
}
