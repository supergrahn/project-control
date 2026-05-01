import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router/recordOutcome'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

function seedDecision(opts: { provider_id: string; phase?: string; complexity?: string }): string {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, '{}', ?)`,
  ).run(decisionId, sessionId, opts.provider_id, opts.phase ?? 'develop', opts.complexity ?? 'normal', new Date().toISOString())
  return decisionId
}

describe('recordOutcome', () => {
  it('writes a routing_outcomes row', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const decisionId = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId, outcome: 'success' })
    const row = db.prepare('SELECT * FROM routing_outcomes WHERE decision_id = ?').get(decisionId)
    expect(row).toBeTruthy()
    expect((row as any).outcome).toBe('success')
  })

  it('seeds a routing_scores row on first success (n=1, rate=1)', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const decisionId = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId, outcome: 'success' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE phase='develop' AND complexity='normal' AND provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(1)
    expect((score as any).success_rate).toBeCloseTo(1.0, 6)
  })

  it('updates rate incrementally on additional outcomes', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const d1 = seedDecision({ provider_id: 'p1' })
    const d2 = seedDecision({ provider_id: 'p1' })
    const d3 = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId: d1, outcome: 'success' })
    recordOutcome(db, { decisionId: d2, outcome: 'failure' })
    recordOutcome(db, { decisionId: d3, outcome: 'success' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(3)
    expect((score as any).success_rate).toBeCloseTo(2 / 3, 6)
  })

  it('transient_error does not change n_outcomes or success_rate', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const d1 = seedDecision({ provider_id: 'p1' })
    const d2 = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId: d1, outcome: 'success' })
    recordOutcome(db, { decisionId: d2, outcome: 'transient_error' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(1)
    expect((score as any).success_rate).toBeCloseTo(1.0, 6)
    // outcomes table still got a row
    const outcomes = db.prepare(`SELECT COUNT(*) AS c FROM routing_outcomes`).get() as { c: number }
    expect(outcomes.c).toBe(2)
  })

  it('keeps phase × complexity × provider cells separate', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const dDevNormal = seedDecision({ provider_id: 'p1', phase: 'develop', complexity: 'normal' })
    const dPlanHard  = seedDecision({ provider_id: 'p1', phase: 'plan',    complexity: 'hard'   })
    recordOutcome(db, { decisionId: dDevNormal, outcome: 'success' })
    recordOutcome(db, { decisionId: dPlanHard,  outcome: 'failure' })
    const all = db.prepare('SELECT phase, complexity, n_outcomes, success_rate FROM routing_scores ORDER BY phase').all()
    expect(all).toHaveLength(2)
  })
})
