import type { SessionPhase } from '@/lib/db'
import type { ProviderType } from '@/lib/db/providers'
import type { Complexity } from './types'

/**
 * 0..1 — how well this provider type suits this (phase, complexity) cell.
 * Initial weights based on stated provider strengths:
 *   - claude (Opus): planning, architecture, code review, deep reasoning
 *   - codex (gpt-5.3): aggressive shell automation, bulk edits, refactors
 *   - gemini: long context, broad sweeps, multi-modal
 *   - ollama (local 9B): triage, classification, structured extraction
 * Adaptive layer takes over per cell once n_observed crosses N_PRIOR.
 */
export const SUITABILITY: Record<SessionPhase, Record<Complexity, Record<ProviderType, number>>> = {
  brainstorm: {
    trivial: { claude: 0.75, codex: 0.50, gemini: 0.70, ollama: 0.55 },
    normal:  { claude: 0.90, codex: 0.60, gemini: 0.80, ollama: 0.35 },
    hard:    { claude: 0.95, codex: 0.60, gemini: 0.85, ollama: 0.20 },
  },
  spec: {
    trivial: { claude: 0.85, codex: 0.60, gemini: 0.75, ollama: 0.40 },
    normal:  { claude: 0.95, codex: 0.70, gemini: 0.80, ollama: 0.30 },
    hard:    { claude: 0.98, codex: 0.70, gemini: 0.85, ollama: 0.15 },
  },
  plan: {
    trivial: { claude: 0.85, codex: 0.65, gemini: 0.75, ollama: 0.40 },
    normal:  { claude: 0.95, codex: 0.75, gemini: 0.80, ollama: 0.25 },
    hard:    { claude: 0.98, codex: 0.75, gemini: 0.85, ollama: 0.10 },
  },
  develop: {
    trivial: { claude: 0.70, codex: 0.85, gemini: 0.60, ollama: 0.50 },
    normal:  { claude: 0.85, codex: 0.95, gemini: 0.70, ollama: 0.25 },
    hard:    { claude: 0.95, codex: 0.90, gemini: 0.75, ollama: 0.10 },
  },
  review: {
    trivial: { claude: 0.85, codex: 0.55, gemini: 0.75, ollama: 0.40 },
    normal:  { claude: 0.95, codex: 0.65, gemini: 0.80, ollama: 0.25 },
    hard:    { claude: 0.98, codex: 0.65, gemini: 0.85, ollama: 0.15 },
  },
  orchestrator: {
    trivial: { claude: 0.85, codex: 0.70, gemini: 0.70, ollama: 0.40 },
    normal:  { claude: 0.92, codex: 0.75, gemini: 0.75, ollama: 0.30 },
    hard:    { claude: 0.98, codex: 0.80, gemini: 0.85, ollama: 0.15 },
  },
}

/**
 * 0..1 — relative cost per provider type. Local ≈ free, frontier models ≈ 1.
 * Per-provider override available via Provider.config.cost_weight.
 */
export const COST_BY_PROVIDER_TYPE: Record<ProviderType, number> = {
  ollama: 0.01,
  gemini: 0.05,
  codex:  0.60,
  claude: 0.50,
}

/** Bayesian prior weight. Defaults dominate until n_observed crosses this. */
export const N_PRIOR = 10

/** Divide-by-zero guard in scoring. */
export const COST_EPSILON = 0.01

/** Defensive default when SUITABILITY does not contain a provider type. */
export const SUITABILITY_FALLBACK = 0.5
