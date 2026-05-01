import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET } from '@/app/api/router/scores/route'
import { getDb } from '@/lib/db'

describe('GET /api/router/scores', () => {
  it('returns rows sorted by phase, complexity, provider_id', async () => {
    const db = getDb()
    // FK enforcement is ON in initDb. routing_scores.provider_id has a FK to
    // providers(id); for this shape-only test we skip the FK constraint to
    // avoid having to seed unrelated provider fixtures (matches the pattern
    // in tests/api/router-decisions.test.ts).
    db.pragma('foreign_keys = OFF')
    db.prepare('DELETE FROM routing_scores').run()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('plan','hard','b',1,0.5,?)`,
    ).run(now)
    db.prepare(
      `INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('develop','normal','a',2,0.7,?)`,
    ).run(now)

    const res = await GET()
    const body = await res.json()
    // 'develop' sorts before 'plan' lexicographically, so 'a' comes first.
    expect(body.scores.map((r: { provider_id: string }) => r.provider_id)).toEqual(['a', 'b'])
    // Lock down the full row shape so a future column rename or projection
    // change in the SELECT doesn't silently drop a column on the wire.
    expect(body.scores[0]).toMatchObject({
      phase: 'develop',
      complexity: 'normal',
      provider_id: 'a',
      n_outcomes: 2,
      success_rate: 0.7,
    })
    expect(typeof body.scores[0].updated_at).toBe('string')
  })
})
