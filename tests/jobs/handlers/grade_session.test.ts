import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { createProvider } from '@/lib/db/providers'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return {
    ...actual,
    getDefaultLocalProvider: () => ({ id: 'p', name: 'Local', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }),
  }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleGradeSession } from '@/lib/jobs/handlers/grade_session'

let db: Database
let sessionId: string
let taskId: string
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  createProvider(db, { id: 'pickedProv', name: 'Picked', type: 'claude', command: 'c', config: null })
  taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'Build feature' })
  sessionId = randomUUID()
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, status, created_at, ended_at, summary)
              VALUES (?, ?, ?, ?, ?, ?, 'ended', ?, ?, ?)`)
    .run(sessionId, projectId, 'L', 'spec', null, taskId, new Date().toISOString(), new Date().toISOString(), 'finished the work')
  // Insert a routing decision for this session
  db.prepare(`INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('d1', sessionId, taskId, 'pickedProv', 'spec', 'normal', '{}', new Date().toISOString())
  vi.mocked(localComplete).mockReset()
})

describe('grade_session handler', () => {
  it('writes grade + reason and records routing outcome on success', async () => {
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "yes", "reason": "shipped what was asked" }')
    await handleGradeSession(db, { session_id: sessionId })
    const row = db.prepare(`SELECT grade, grade_reason, graded_at FROM sessions WHERE id = ?`).get(sessionId) as any
    expect(row.grade).toBe('yes')
    expect(row.grade_reason).toBe('shipped what was asked')
    expect(row.graded_at).toBeTruthy()
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = ?`).get('d1') as any
    expect(outcome.outcome).toBe('success')
  })

  it('partial grade maps to partial outcome', async () => {
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "partial", "reason": "did half" }')
    await handleGradeSession(db, { session_id: sessionId })
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = ?`).get('d1') as any
    expect(outcome.outcome).toBe('partial')
  })

  it('throws on malformed JSON (lets runner retry)', async () => {
    vi.mocked(localComplete).mockResolvedValue('not json')
    await expect(handleGradeSession(db, { session_id: sessionId })).rejects.toThrow()
  })

  it('skips routing update when no decision exists for the session', async () => {
    db.prepare(`DELETE FROM routing_decisions WHERE session_id = ?`).run(sessionId)
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "yes", "reason": "x" }')
    await handleGradeSession(db, { session_id: sessionId })
    const row = db.prepare(`SELECT grade FROM sessions WHERE id = ?`).get(sessionId) as any
    expect(row.grade).toBe('yes')  // grade still written
  })
})
