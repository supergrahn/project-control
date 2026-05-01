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
  })
})
