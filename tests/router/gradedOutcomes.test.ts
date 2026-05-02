import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { createProject, createSession, getDb } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { listGradedOutcomes } from '@/lib/router/gradedOutcomes'

let projectId: string

function insertDecision(opts: { sessionId: string; provider: string; phase?: string; complexity?: string }) {
  const db = getDb()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, '{}', ?)`,
  ).run(
    randomUUID(),
    opts.sessionId,
    opts.provider,
    opts.phase ?? 'develop',
    opts.complexity ?? 'normal',
    new Date().toISOString(),
  )
}

function setGrade(sessionId: string, grade: 'yes' | 'no' | 'partial' | null) {
  const db = getDb()
  db.prepare('UPDATE sessions SET grade = ?, graded_at = ? WHERE id = ?').run(grade, '2026-05-02T10:00:00.000Z', sessionId)
}

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
  createProvider(db, { id: 'claude', name: 'Claude', type: 'claude', command: 'c', config: null })
  createProvider(db, { id: 'codex',  name: 'Codex',  type: 'codex',  command: 'c', config: null })
  createProvider(db, { id: 'gemini', name: 'Gemini', type: 'gemini', command: 'g', config: null })
})

describe('listGradedOutcomes', () => {
  it('returns [] when no decisions or no graded sessions exist', () => {
    expect(listGradedOutcomes(getDb())).toEqual([])
  })

  it('aggregates graded outcomes per picked_provider', () => {
    const db = getDb()
    const s1 = randomUUID()
    const s2 = randomUUID()
    const s3 = randomUUID()
    const s4 = randomUUID()
    createSession(db, { id: s1, projectId, label: 'L', phase: 'develop', sourceFile: null })
    createSession(db, { id: s2, projectId, label: 'L', phase: 'develop', sourceFile: null })
    createSession(db, { id: s3, projectId, label: 'L', phase: 'develop', sourceFile: null })
    createSession(db, { id: s4, projectId, label: 'L', phase: 'develop', sourceFile: null })

    insertDecision({ sessionId: s1, provider: 'claude' })
    insertDecision({ sessionId: s2, provider: 'claude' })
    insertDecision({ sessionId: s3, provider: 'claude' })
    insertDecision({ sessionId: s4, provider: 'codex' })

    setGrade(s1, 'yes')
    setGrade(s2, 'partial')
    setGrade(s3, 'no')
    setGrade(s4, 'yes')

    const rows = listGradedOutcomes(db)
    const claude = rows.find((r) => r.provider === 'claude')
    const codex  = rows.find((r) => r.provider === 'codex')
    expect(claude).toEqual({
      provider: 'claude',
      graded: 3, success: 1, partial: 1, fail: 1,
      // (1 + 0.5 * 1) / 3 = 0.5
      success_percent: 50,
    })
    expect(codex).toEqual({
      provider: 'codex',
      graded: 1, success: 1, partial: 0, fail: 0,
      success_percent: 100,
    })
  })

  it('excludes ungraded sessions from the denominator', () => {
    const db = getDb()
    const s1 = randomUUID()
    const s2 = randomUUID()
    createSession(db, { id: s1, projectId, label: 'L', phase: 'develop', sourceFile: null })
    createSession(db, { id: s2, projectId, label: 'L', phase: 'develop', sourceFile: null })
    insertDecision({ sessionId: s1, provider: 'claude' })
    insertDecision({ sessionId: s2, provider: 'claude' })
    setGrade(s1, 'yes')
    // s2 is left ungraded — must not affect the count
    const [row] = listGradedOutcomes(db)
    expect(row.graded).toBe(1)
    expect(row.success).toBe(1)
    expect(row.success_percent).toBe(100)
  })

  it('omits providers whose decisions all reference ungraded sessions', () => {
    const db = getDb()
    const s1 = randomUUID()
    createSession(db, { id: s1, projectId, label: 'L', phase: 'develop', sourceFile: null })
    insertDecision({ sessionId: s1, provider: 'gemini' })
    // s1 ungraded — gemini row should be filtered out by HAVING graded > 0
    expect(listGradedOutcomes(db)).toEqual([])
  })
})
