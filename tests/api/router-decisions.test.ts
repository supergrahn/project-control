import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

const ORIGINAL_ENABLE_DEBUG = process.env.ENABLE_DEBUG_PAGES

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET as getDecisions } from '@/app/api/router/decisions/route'
import { POST as resetLearning } from '@/app/api/router/reset-learning/route'
import { getDb, createProject, createSession } from '@/lib/db'

beforeEach(() => {
  const db = getDb()
  // FK enforcement is ON in initDb. These admin/inspection tests insert
  // routing rows referencing providers/decisions that don't exist as test
  // fixtures (see the plan's note in Task 13 about FK enforcement). Disable
  // FKs at the connection level for this suite — we're testing handler shape,
  // not relational integrity.
  db.pragma('foreign_keys = OFF')
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM projects').run()
})

describe('GET /api/router/decisions', () => {
  it('returns 400 when sessionId is missing', async () => {
    const res = await getDecisions(new NextRequest('http://localhost/api/router/decisions'))
    expect(res.status).toBe(400)
  })

  it('returns the latest decision with score_breakdown parsed', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    db.prepare(
      `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
       VALUES ('d', ?, NULL, 'p1', 'develop', 'normal', ?, ?)`,
    ).run(sessionId, JSON.stringify({ suitability: 0.85, total: 1.6, considered: [] }), new Date().toISOString())

    const res = await getDecisions(new NextRequest(`http://localhost/api/router/decisions?sessionId=${sessionId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decision.picked_provider).toBe('p1')
    expect(body.decision.score_breakdown.suitability).toBe(0.85)
  })

  it('returns null decision when none exists', async () => {
    const res = await getDecisions(new NextRequest('http://localhost/api/router/decisions?sessionId=missing'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ decision: null })
  })
})

describe('POST /api/router/reset-learning', () => {
  afterEach(() => {
    if (ORIGINAL_ENABLE_DEBUG === undefined) delete process.env.ENABLE_DEBUG_PAGES
    else process.env.ENABLE_DEBUG_PAGES = ORIGINAL_ENABLE_DEBUG
  })

  it('returns 404 when ENABLE_DEBUG_PAGES is not set', async () => {
    delete process.env.ENABLE_DEBUG_PAGES
    const res = await resetLearning()
    expect(res.status).toBe(404)
  })

  it('deletes all rows from routing_outcomes and routing_scores when gated open', async () => {
    process.env.ENABLE_DEBUG_PAGES = '1'
    const db = getDb()
    db.prepare(`INSERT INTO routing_outcomes (id, decision_id, outcome, created_at) VALUES ('o1','d1','success',?)`).run(new Date().toISOString())
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('develop','normal','p',5,0.6,?)`).run(new Date().toISOString())
    const res = await resetLearning()
    expect(res.status).toBe(200)
    expect((db.prepare('SELECT COUNT(*) AS c FROM routing_outcomes').get() as { c: number }).c).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS c FROM routing_scores').get() as { c: number }).c).toBe(0)
  })

  it('preserves routing_decisions (decisions are an audit log)', async () => {
    process.env.ENABLE_DEBUG_PAGES = '1'
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    db.prepare(
      `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
       VALUES ('keep-me', ?, NULL, 'p', 'develop', 'normal', '{}', ?)`,
    ).run(sessionId, new Date().toISOString())
    db.prepare(`INSERT INTO routing_outcomes (id, decision_id, outcome, created_at) VALUES ('o','keep-me','success',?)`).run(new Date().toISOString())
    await resetLearning()
    expect((db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }).c).toBe(1)
  })
})
