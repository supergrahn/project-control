import { describe, expect, it } from 'vitest'
import { score } from '@/lib/router/scoring'
import { N_PRIOR } from '@/lib/router/defaults'

const claude = { id: 'c', type: 'claude', config: null } as const
const ollama = { id: 'o', type: 'ollama', config: null } as const

describe('score', () => {
  it('cold-start (n=0): equals suit² / cost', () => {
    const s = score(claude, 'plan', 'hard', { n: 0, rate: 0 })
    // SUITABILITY.plan.hard.claude = 0.98; COST_BY_PROVIDER_TYPE.claude = 0.5
    // suit² / cost = 0.9604 / 0.5 = 1.9208
    expect(s).toBeCloseTo(1.9208, 4)
  })

  it('blends defaults and observed at n=5 with N_PRIOR=10', () => {
    // suit = 0.85 (plan, trivial, claude); rate prior = 0.85; observed n=5, observed rate 0.4
    // blended = (5*0.4 + 10*0.85) / 15 = (2 + 8.5)/15 = 0.7
    // total = 0.85 * 0.7 / 0.5 = 1.19
    const s = score(claude, 'plan', 'trivial', { n: 5, rate: 0.4 })
    expect(s).toBeCloseTo(1.19, 3)
  })

  it('observed dominates when n >> N_PRIOR', () => {
    // suit = 0.85 (plan, trivial, claude); n=1000, observed rate=1.0, default=0.85
    // blended ≈ (1000 + 10*0.85)/1010 = 1008.5/1010 ≈ 0.9985
    // total = 0.85 * 0.9985 / 0.5 ≈ 1.6975
    const s = score(claude, 'plan', 'trivial', { n: 1000, rate: 1.0 })
    expect(s).toBeGreaterThan(1.69)
    expect(s).toBeLessThan(1.70)
  })

  it('per-provider cost_weight in config overrides type default', () => {
    const cheap = { id: 'cheap', type: 'claude' as const, config: JSON.stringify({ cost_weight: 0.1 }) }
    // suit² / 0.1 instead of / 0.5
    const cheapScore = score(cheap, 'plan', 'hard', { n: 0, rate: 0 })
    const normalScore = score(claude, 'plan', 'hard', { n: 0, rate: 0 })
    expect(cheapScore).toBeGreaterThan(normalScore)
  })

  it('cost_weight = 0 does not divide by zero (uses COST_EPSILON)', () => {
    const free = { id: 'f', type: 'claude' as const, config: JSON.stringify({ cost_weight: 0 }) }
    const s = score(free, 'plan', 'hard', { n: 0, rate: 0 })
    expect(Number.isFinite(s)).toBe(true)
  })

  it('unknown provider type falls back to SUITABILITY_FALLBACK (0.5)', () => {
    const novel = { id: 'n', type: 'mystery', config: null }
    const s = score(novel, 'plan', 'hard', { n: 0, rate: 0 })
    // suit² / cost-fallback: cost lookup also unknown; spec says use COST_EPSILON for missing cost
    // suit = 0.5, so suit² = 0.25; cost falls back to COST_EPSILON = 0.01; total = 0.25/0.01 = 25
    expect(s).toBeCloseTo(25, 2)
  })

  it('N_PRIOR is 10 (sanity)', () => {
    expect(N_PRIOR).toBe(10)
  })
})
