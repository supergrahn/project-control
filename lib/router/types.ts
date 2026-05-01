import type { SessionPhase } from '@/lib/db'
import type { ProviderType } from '@/lib/db/providers'

export type Complexity = 'trivial' | 'normal' | 'hard'
export type Outcome = 'success' | 'failure' | 'transient_error'

export type ScoreBreakdown = {
  suitability: number
  cost: number
  success_rate_blended: number
  n_observed: number
  total: number
  considered: Array<{ providerId: string; providerName: string; score: number }>
}

export type RoutingDecision = {
  id: string
  session_id: string
  task_id: string | null
  picked_provider: string
  phase: SessionPhase
  complexity: Complexity
  score_breakdown: string         // JSON-encoded ScoreBreakdown
  created_at: string
}

export type RoutingOutcome = {
  id: string
  decision_id: string
  outcome: Outcome
  created_at: string
}

export type RoutingScore = {
  phase: SessionPhase
  complexity: Complexity
  provider_id: string
  n_outcomes: number
  success_rate: number
  updated_at: string
}

export type { SessionPhase, ProviderType }
