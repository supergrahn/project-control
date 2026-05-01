import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getActiveProviders } from '@/lib/db/providers'
import { scoreWithBreakdown } from './scoring'
import { classifyComplexity } from './classify'
import type { Complexity, RoutingDecision, ScoreBreakdown, SessionPhase } from './types'

export type PickRouteOpts = {
  projectId: string
  sessionId: string
  taskId?: string
  phase: SessionPhase
}

type ScoreRow = { provider_id: string; n_outcomes: number; success_rate: number }

function loadScores(db: Database, phase: SessionPhase, complexity: Complexity): Map<string, ScoreRow> {
  const rows = db
    .prepare('SELECT provider_id, n_outcomes, success_rate FROM routing_scores WHERE phase = ? AND complexity = ?')
    .all(phase, complexity) as ScoreRow[]
  return new Map(rows.map((r) => [r.provider_id, r]))
}

export async function pickRoute(db: Database, opts: PickRouteOpts): Promise<RoutingDecision> {
  const providers = getActiveProviders(db)
  if (providers.length === 0) throw new Error('NO_PROVIDERS_CONFIGURED')

  const complexity: Complexity = await classifyComplexity(db, opts.taskId)
  const scoreMap = loadScores(db, opts.phase, complexity)

  const ranked = providers.map((p) => {
    const observed = scoreMap.get(p.id) ?? { n_outcomes: 0, success_rate: 0 }
    const parts = scoreWithBreakdown(p, opts.phase, complexity, { n: observed.n_outcomes, rate: observed.success_rate })
    return { provider: p, parts, observed }
  })

  ranked.sort((a, b) => {
    if (b.parts.total !== a.parts.total) return b.parts.total - a.parts.total
    return a.provider.id.localeCompare(b.provider.id)
  })

  const winner = ranked[0]

  const breakdown: ScoreBreakdown = {
    suitability: winner.parts.suitability,
    cost: winner.parts.cost,
    success_rate_blended: winner.parts.success_rate_blended,
    n_observed: winner.observed.n_outcomes,
    total: winner.parts.total,
    considered: ranked.map((r) => ({
      providerId: r.provider.id,
      providerName: r.provider.name,
      score: r.parts.total,
    })),
  }

  const decision: RoutingDecision = {
    id: randomUUID(),
    session_id: opts.sessionId,
    task_id: opts.taskId ?? null,
    picked_provider: winner.provider.id,
    phase: opts.phase,
    complexity,
    score_breakdown: JSON.stringify(breakdown),
    created_at: new Date().toISOString(),
  }

  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decision.id, decision.session_id, decision.task_id, decision.picked_provider,
    decision.phase, decision.complexity, decision.score_breakdown, decision.created_at,
  )

  return decision
}
