import { SUITABILITY, COST_BY_PROVIDER_TYPE, N_PRIOR, COST_EPSILON, SUITABILITY_FALLBACK } from './defaults'
import type { SessionPhase } from '@/lib/db'
import type { Complexity } from './types'

// Permissive `type: string` so the function can score providers whose type was
// added after the SUITABILITY matrix was last updated (it falls back gracefully).
type ScoreInputProvider = {
  id: string
  type: string
  config: string | null
}

/** n: number of observations, ≥ 0. rate: success rate in [0, 1]. */
export type Observed = { n: number; rate: number }

function getCost(provider: ScoreInputProvider): number {
  if (provider.config) {
    try {
      const parsed = JSON.parse(provider.config) as { cost_weight?: number }
      if (typeof parsed.cost_weight === 'number') return parsed.cost_weight
    } catch {
      // fall through to type default — malformed config should not break routing
    }
  }
  const fromType = (COST_BY_PROVIDER_TYPE as Record<string, number>)[provider.type]
  return typeof fromType === 'number' ? fromType : COST_EPSILON
}

function getSuitability(type: string, phase: SessionPhase, complexity: Complexity): number {
  const phaseMap = SUITABILITY[phase]
  if (!phaseMap) return SUITABILITY_FALLBACK
  const complexityMap = phaseMap[complexity]
  if (!complexityMap) return SUITABILITY_FALLBACK
  const v = (complexityMap as Record<string, number>)[type]
  return typeof v === 'number' ? v : SUITABILITY_FALLBACK
}

export type ScoreParts = {
  suitability: number
  cost: number
  success_rate_blended: number
  total: number
}

export function scoreWithBreakdown(
  provider: ScoreInputProvider,
  phase: SessionPhase,
  complexity: Complexity,
  observed: Observed,
): ScoreParts {
  const suit = getSuitability(provider.type, phase, complexity)
  const cost = Math.max(getCost(provider), COST_EPSILON)
  const blendedRate = (observed.n * observed.rate + N_PRIOR * suit) / (observed.n + N_PRIOR)
  return {
    suitability: suit,
    cost,
    success_rate_blended: blendedRate,
    total: (suit * blendedRate) / cost,
  }
}

export function score(
  provider: ScoreInputProvider,
  phase: SessionPhase,
  complexity: Complexity,
  observed: Observed,
): number {
  return scoreWithBreakdown(provider, phase, complexity, observed).total
}
