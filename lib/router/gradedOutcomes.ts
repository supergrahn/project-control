import type { Database } from 'better-sqlite3'

export type GradedOutcomeRow = {
  provider: string
  graded: number
  success: number
  partial: number
  fail: number
  /**
   * Score-based success percentage matching the router's math:
   * (success + 0.5 * partial) / graded * 100. Null when graded is 0.
   */
  success_percent: number | null
}

/**
 * Aggregate graded session outcomes per picked_provider. Joins
 * routing_decisions to sessions on session_id and counts only sessions where
 * a grade has been assigned (sessions still running, sessions without
 * task_id, and sessions whose grading job hasn't completed are all excluded
 * from the denominator).
 *
 * Mirrored from the SQL in plan §8d. The success% is computed in JS so the
 * caller doesn't have to deal with sqlite's float promotion rules.
 */
export function listGradedOutcomes(db: Database): GradedOutcomeRow[] {
  type RawRow = {
    provider: string
    graded: number
    success: number
    partial: number
    fail: number
  }

  const rows = db
    .prepare(
      `SELECT
         rd.picked_provider AS provider,
         SUM(CASE WHEN s.grade IS NOT NULL THEN 1 ELSE 0 END) AS graded,
         SUM(CASE WHEN s.grade = 'yes'     THEN 1 ELSE 0 END) AS success,
         SUM(CASE WHEN s.grade = 'partial' THEN 1 ELSE 0 END) AS partial,
         SUM(CASE WHEN s.grade = 'no'      THEN 1 ELSE 0 END) AS fail
       FROM routing_decisions rd
       LEFT JOIN sessions s ON s.id = rd.session_id
       GROUP BY rd.picked_provider
       HAVING graded > 0
       ORDER BY rd.picked_provider`,
    )
    .all() as RawRow[]

  return rows.map((r) => ({
    provider: r.provider,
    graded: r.graded,
    success: r.success,
    partial: r.partial,
    fail: r.fail,
    success_percent: r.graded > 0 ? ((r.success + 0.5 * r.partial) / r.graded) * 100 : null,
  }))
}
