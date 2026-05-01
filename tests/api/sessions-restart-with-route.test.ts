import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/session-manager', () => ({
  respawnSessionWithProvider: vi.fn(async () => undefined),
}))

import { POST } from '@/app/api/sessions/[id]/restart-with-route/route'
import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { respawnSessionWithProvider } from '@/lib/session-manager'

const respawn = respawnSessionWithProvider as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  respawn.mockReset()
  respawn.mockResolvedValue(undefined)
})

function p(id: string) { return { params: Promise.resolve({ id }) } }

function seed(opts: { complexity?: 'trivial' | 'normal' | 'hard'; status?: string } = {}): { sessionId: string; failedDecisionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
  createProvider(db, { id: 'old', name: 'O', type: 'claude', command: 'c', config: null })
  createProvider(db, { id: 'new', name: 'N', type: 'codex',  command: 'c', config: null })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  getDb().prepare(`UPDATE sessions SET status = ? WHERE id = ?`).run(opts.status ?? 'needs_route_retry', sessionId)
  const failedDecisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, 'old', 'develop', ?, '{}', ?)`,
  ).run(failedDecisionId, sessionId, opts.complexity ?? 'normal', new Date().toISOString())
  return { sessionId, failedDecisionId }
}

describe('POST /api/sessions/[id]/restart-with-route', () => {
  it('records transient_error on the failed decision', async () => {
    const { sessionId, failedDecisionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(200)
    const outcomes = getDb()
      .prepare('SELECT outcome FROM routing_outcomes WHERE decision_id = ?')
      .all(failedDecisionId)
    expect(outcomes).toEqual([{ outcome: 'transient_error' }])
  })

  it('writes a fresh routing_decisions row for the new provider', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    await POST(req, p(sessionId))
    const decisions = getDb()
      .prepare('SELECT picked_provider FROM routing_decisions WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId)
    expect(decisions).toEqual([{ picked_provider: 'old' }, { picked_provider: 'new' }])
  })

  it('flips session status back to active and calls respawn', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    await POST(req, p(sessionId))
    const status = (getDb().prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId) as any).status
    expect(status).toBe('active')
    expect(respawn).toHaveBeenCalledWith(sessionId, 'new')
  })

  it('returns 400 if providerId is missing', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(400)
  })

  it('returns 404 if session does not exist', async () => {
    const req = new NextRequest('http://localhost/api/sessions/nope/restart-with-route', {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    const res = await POST(req, p('nope'))
    expect(res.status).toBe(404)
  })

  it('returns 404 if provider does not exist', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'nope' }),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(404)
  })

  it('returns 409 when the session is not in needs_route_retry', async () => {
    const { sessionId } = seed({ status: 'active' })
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(409)
    expect(respawn).not.toHaveBeenCalled()
    // Nothing should have been written under the precondition guard.
    const decisions = getDb()
      .prepare(`SELECT COUNT(*) AS c FROM routing_decisions WHERE session_id = ? AND picked_provider = 'new'`)
      .get(sessionId) as { c: number }
    expect(decisions.c).toBe(0)
  })

  it('carries complexity forward from the failed decision (does not hardcode normal)', async () => {
    const { sessionId } = seed({ complexity: 'hard' })
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    await POST(req, p(sessionId))
    const newDecision = getDb()
      .prepare(`SELECT complexity FROM routing_decisions WHERE session_id = ? AND picked_provider = 'new'`)
      .get(sessionId) as { complexity: string }
    expect(newDecision.complexity).toBe('hard')
  })
})
