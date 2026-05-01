import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/router/classify', () => ({
  classifyComplexity: vi.fn(async () => 'normal'),
}))

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, setTaskComplexity } from '@/lib/db/tasks'
import { pickRoute } from '@/lib/router/pickRoute'
import { classifyComplexity } from '@/lib/router/classify'

const cc = classifyComplexity as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  cc.mockReset()
  cc.mockResolvedValue('normal')
})

function withProjectAndSession(): { projectId: string; sessionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  return { projectId, sessionId }
}

describe('pickRoute', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no active provider exists', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    await expect(pickRoute(getDb(), { projectId, sessionId, taskId: undefined, phase: 'develop' }))
      .rejects.toThrow(/NO_PROVIDERS_CONFIGURED/)
  })

  it('picks the highest-scoring provider on cold start (cost-weighted)', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    // At develop/normal: ollama wins because its near-zero cost dominates the
    // suitability gap. cold scores: codex 0.95²/0.6≈1.50, ollama 0.25²/0.01=6.25.
    createProvider(db, { id: 'p-codex',  name: 'codex',  type: 'codex',  command: 'codex',  config: null })
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'p-ollama', name: 'ollama', type: 'ollama', command: 'ollama', config: null })

    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'develop' })
    expect(decision.picked_provider).toBe('p-ollama')
  })

  it('writes a routing_decisions row with the score breakdown', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'plan' })
    const row = db.prepare('SELECT * FROM routing_decisions WHERE id = ?').get(decision.id)
    expect(row).toBeTruthy()
    const breakdown = JSON.parse((row as any).score_breakdown)
    expect(breakdown.suitability).toBeGreaterThan(0)
    expect(breakdown.considered).toHaveLength(1)
  })

  it('uses task complexity when available', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'hard', false)
    cc.mockResolvedValue('hard')
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId, phase: 'spec' })
    expect(decision.complexity).toBe('hard')
  })

  it('uses "normal" complexity for taskless sessions', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'develop' })
    expect(decision.complexity).toBe('normal')
  })

  it('considered list is sorted by score descending with deterministic tiebreak', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    // identical types & no observed data → identical scores → tiebreak by providerId asc
    createProvider(db, { id: 'b-claude', name: 'b', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'a-claude', name: 'a', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'plan' })
    const breakdown = JSON.parse(
      (db.prepare('SELECT score_breakdown FROM routing_decisions WHERE id = ?').get(decision.id) as any).score_breakdown,
    )
    expect(breakdown.considered[0].providerId).toBe('a-claude')
    expect(breakdown.considered[1].providerId).toBe('b-claude')
  })

  it('observed routing_scores can flip the cold-start ranking', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    // At plan/hard: claude wins cold (0.98²/0.5≈1.92 vs ollama 0.10²/0.01=1.0).
    // After 1000 successful ollama observations at rate 0.99, ollama scores
    // ≈ 0.10 * blend(1000,0.99,prior=0.10) / 0.01 ≈ 0.10 * 0.982 / 0.01 ≈ 9.82,
    // overtaking claude.
    createProvider(db, { id: 'p-ollama', name: 'ollama', type: 'ollama', command: 'ollama', config: null })
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at)
                VALUES ('plan', 'hard', 'p-ollama', 1000, 0.99, ?)`).run(new Date().toISOString())
    cc.mockResolvedValue('hard')
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'plan' })
    expect(decision.picked_provider).toBe('p-ollama')
  })
})
