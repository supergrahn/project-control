import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession, endSession, getLatestSessionForFile } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { onPhaseAdvanced, onOverrideDecision } from '@/server/orchestrator-watcher'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

function seed(): { sessionId: string; decisionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
  createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, 'p1', 'develop', 'normal', '{}', ?)`,
  ).run(decisionId, sessionId, new Date().toISOString())
  return { sessionId, decisionId }
}

describe('orchestrator-watcher → router hook', () => {
  it('records success on phase advance', () => {
    const { sessionId } = seed()
    onPhaseAdvanced(getDb(), sessionId)
    const outcomes = getDb().prepare('SELECT outcome FROM routing_outcomes').all()
    expect(outcomes).toEqual([{ outcome: 'success' }])
  })

  it('records failure on override decision', () => {
    const { sessionId } = seed()
    onOverrideDecision(getDb(), sessionId)
    const outcomes = getDb().prepare('SELECT outcome FROM routing_outcomes').all()
    expect(outcomes).toEqual([{ outcome: 'failure' }])
  })

  it('no-ops when there is no routing decision for the session', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    onPhaseAdvanced(db, sessionId)
    const outcomes = db.prepare('SELECT COUNT(*) AS c FROM routing_outcomes').get() as { c: number }
    expect(outcomes.c).toBe(0)
  })
})

describe('getLatestSessionForFile', () => {
  it('finds an ended session by source_file (where the active-only lookup would silently miss it)', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sessionId = randomUUID()
    const sourceFile = '/some/spec.md'
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile })
    endSession(db, sessionId)
    const found = getLatestSessionForFile(db, sourceFile)
    expect(found?.id).toBe(sessionId)
    expect(found?.status).toBe('ended')
  })

  it('prefers an active session over an older ended one for the same file', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const sourceFile = '/some/spec2.md'
    const oldId = randomUUID()
    createSession(db, { id: oldId, projectId, label: 'L', phase: 'develop', sourceFile })
    endSession(db, oldId)
    const newActiveId = randomUUID()
    createSession(db, { id: newActiveId, projectId, label: 'L2', phase: 'develop', sourceFile })
    const found = getLatestSessionForFile(db, sourceFile)
    expect(found?.id).toBe(newActiveId)
  })
})
