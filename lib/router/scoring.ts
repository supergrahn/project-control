import { SUITABILITY, COST_BY_PROVIDER_TYPE, N_PRIOR, COST_EPSILON, SUITABILITY_FALLBACK } from './defaults'
import type { SessionPhase } from '@/lib/db'
import type { ProviderType } from '@/lib/db/providers'
import type { Complexity } from './types'

type ScoreInputProvider = {
  id: string
  type: ProviderType | string
  config: string | null
}

export type Observed = { n: number; rate: number }

function getCost(provider: ScoreInputProvider): number {
  if (provider.config) {
    try {
      const parsed = JSON.parse(provider.config) as { cost_weight?: number }
      if (typeof parsed.cost_weight === 'number') return parsed.cost_weight
    } catch {
      // fall through to type default
    }
  }
  const fromType = (COST_BY_PROVIDER_TYPE as Record<string, number>)[provider.type]
  return typeof fromType === 'number' ? fromType : COST_EPSILON
}

function getSuitability(type: ProviderType | string, phase: SessionPhase, complexity: Complexity): number {
  const phaseMap = SUITABILITY[phase]
  if (!phaseMap) return SUITABILITY_FALLBACK
  const complexityMap = phaseMap[complexity]
  if (!complexityMap) return SUITABILITY_FALLBACK
  const v = (complexityMap as Record<string, number>)[type]
  return typeof v === 'number' ? v : SUITABILITY_FALLBACK
}

export function score(
  provider: ScoreInputProvider,
  phase: SessionPhase,
  complexity: Complexity,
  observed: Observed,
): number {
  const suit = getSuitability(provider.type, phase, complexity)
  const cost = Math.max(getCost(provider), COST_EPSILON)
  const deflt = suit
  const blendedRate = (observed.n * observed.rate + N_PRIOR * deflt) / (observed.n + N_PRIOR)
  return (suit * blendedRate) / cost
}
