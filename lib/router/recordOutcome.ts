import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { Outcome } from './types'

export type RecordOutcomeOpts = {
  decisionId: string
  outcome: Outcome
}

type DecisionRow = { phase: string; complexity: string; picked_provider: string }
type ScoreRow    = { n_outcomes: number; success_rate: number }

// Intentionally non-transactional: a crash between the outcome insert and the
// score upsert leaves the next outcome to rebuild sumPrev = success_rate × n
// from the stored row, so the rate self-heals on the next call.
//
// The float-sum recovery (sumPrev = success_rate × n_outcomes) is numerically
// safe at this table's expected scale (n in the thousands). At n in the tens
// of millions, IEEE-754 drift would start to matter; if that ever ships, store
// n_success directly and compute the rate on read.
export function recordOutcome(db: Database, opts: RecordOutcomeOpts): void {
  const { decisionId, outcome } = opts
  const now = new Date().toISOString()

  // Always log the outcome event for analytics.
  db.prepare(
    `INSERT INTO routing_outcomes (id, decision_id, outcome, created_at) VALUES (?, ?, ?, ?)`,
  ).run(randomUUID(), decisionId, outcome, now)

  // transient_error is not a quality signal — skip the score update.
  if (outcome === 'transient_error') return

  const decision = db
    .prepare('SELECT phase, complexity, picked_provider FROM routing_decisions WHERE id = ?')
    .get(decisionId) as DecisionRow | undefined
  if (!decision) return

  const existing = db
    .prepare(
      'SELECT n_outcomes, success_rate FROM routing_scores WHERE phase = ? AND complexity = ? AND provider_id = ?',
    )
    .get(decision.phase, decision.complexity, decision.picked_provider) as ScoreRow | undefined

  const isSuccess = outcome === 'success'
  const newN  = (existing?.n_outcomes ?? 0) + 1
  const sumPrev = (existing?.success_rate ?? 0) * (existing?.n_outcomes ?? 0)
  const newRate = (sumPrev + (isSuccess ? 1 : 0)) / newN

  if (existing) {
    db.prepare(
      'UPDATE routing_scores SET n_outcomes = ?, success_rate = ?, updated_at = ? WHERE phase = ? AND complexity = ? AND provider_id = ?',
    ).run(newN, newRate, now, decision.phase, decision.complexity, decision.picked_provider)
  } else {
    db.prepare(
      'INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(decision.phase, decision.complexity, decision.picked_provider, newN, newRate, now)
  }
}
