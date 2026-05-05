import { describe, it, expect, beforeEach, vi } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test', '/tmp', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

// Use vi.hoisted so the mock variable is available inside the hoisted vi.mock factory
const { spawnSessionMock } = vi.hoisted(() => ({
  spawnSessionMock: vi.fn(async () => 'new-session-id'),
}))
vi.mock('@/lib/session-manager', () => ({
  spawnSession: spawnSessionMock,
}))

import { getDb } from '@/lib/db'
import { POST } from '../continue/route'

function clearSessions() {
  getDb().prepare('DELETE FROM sessions').run()
  getDb().prepare('DELETE FROM tasks').run()
}

function ensureTask(taskId: string) {
  const db = getDb()
  const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId)
  if (!exists) {
    db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, 'p1', ?, 'idea', ?, ?)`)
      .run(taskId, `task-${taskId}`, new Date().toISOString(), new Date().toISOString())
  }
}

function insertSession(opts: {
  id: string
  status?: string
  taskId?: string | null
  sourceFile?: string | null
  label?: string | null
  phase?: string
}) {
  if (opts.taskId) ensureTask(opts.taskId)
  // sessions.label is NOT NULL — empty string when testing the null/empty fallback path
  const labelValue = opts.label === null ? '' : (opts.label ?? `lbl-${opts.id}`)
  getDb().prepare(
    `INSERT INTO sessions (id, project_id, label, phase, status, source_file, task_id, created_at)
     VALUES (?, 'p1', ?, ?, ?, ?, ?, ?)`,
  ).run(opts.id, labelValue, opts.phase ?? 'spec', opts.status ?? 'ended', opts.sourceFile ?? null, opts.taskId ?? null, new Date().toISOString())
}

function makeRequest() {
  return new Request('http://test/api/sessions/x/continue', { method: 'POST' })
}

describe('POST /api/sessions/[id]/continue', () => {
  beforeEach(() => {
    clearSessions()
    spawnSessionMock.mockReset()
    spawnSessionMock.mockResolvedValue('new-session-id')
  })

  it('returns 404 when session not found', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when source has no originator', async () => {
    insertSession({ id: 's1' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when active session exists for same task_id', async () => {
    insertSession({ id: 's1', taskId: 't1', status: 'ended' })
    insertSession({ id: 's-active', taskId: 't1', status: 'active' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(409)
    expect(spawnSessionMock).not.toHaveBeenCalled()
  })

  it('returns 409 when spawnSession throws CONCURRENT_SESSION (source_file collision)', async () => {
    insertSession({ id: 's1', sourceFile: '/tmp/a.md', status: 'ended' })
    spawnSessionMock.mockRejectedValue(new Error('CONCURRENT_SESSION:already-running'))
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.existingId).toBe('already-running')
  })

  it('200 with new sessionId on success and "Continuation:" prefix on label', async () => {
    insertSession({ id: 's1', taskId: 't1', label: 'Original', status: 'ended' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: Original' }))
  })

  it('does not double-prefix labels that already start with "Continuation: "', async () => {
    insertSession({ id: 's1', taskId: 't1', label: 'Continuation: Original', status: 'ended' })
    await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: Original' }))
  })

  it('falls back when label is empty', async () => {
    insertSession({ id: 's1', taskId: 't1', label: null, status: 'ended' })  // null becomes empty string
    await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: session' }))
  })

  it('returns 400 for orchestrator-phase sessions', async () => {
    insertSession({ id: 's1', taskId: 't1', phase: 'orchestrator', status: 'ended' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/orchestrator/)
    expect(spawnSessionMock).not.toHaveBeenCalled()
  })
})
