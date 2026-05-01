import type { Database } from 'better-sqlite3'
import type { RoutingScore } from './types'

/**
 * List all rows from `routing_scores`, sorted by (phase, complexity, provider_id).
 * Shared between `GET /api/router/scores` (UI consumers) and `/debug/router`
 * (server-side render) so both stay in lockstep with the schema.
 */
export function listScores(db: Database): RoutingScore[] {
  return db
    .prepare(
      'SELECT phase, complexity, provider_id, n_outcomes, success_rate, updated_at FROM routing_scores ORDER BY phase, complexity, provider_id',
    )
    .all() as RoutingScore[]
}
