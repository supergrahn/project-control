import { describe, it, expect, beforeEach, vi } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test Project', '/tmp/project', new Date().toISOString())
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
import { POST } from '../start/route'

function clearTasks() {
  getDb().prepare('DELETE FROM tasks').run()
}

function insertTask(opts: {
  id: string
  status: string
  title?: string
  idea_file?: string | null
  spec_file?: string | null
  plan_file?: string | null
}) {
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO tasks (id, project_id, title, status, idea_file, spec_file, plan_file, created_at, updated_at)
    VALUES (?, 'p1', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.id,
    opts.title ?? `Task ${opts.id}`,
    opts.status,
    opts.idea_file ?? null,
    opts.spec_file ?? null,
    opts.plan_file ?? null,
    now,
    now,
  )
}

function makeRequest() {
  return new Request('http://test/api/tasks/t1/start', { method: 'POST' })
}

describe('POST /api/tasks/[id]/start', () => {
  beforeEach(() => {
    clearTasks()
    spawnSessionMock.mockReset()
    spawnSessionMock.mockResolvedValue('new-session-id')
  })

  it('returns 404 when task not found', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/task not found/)
  })

  it('returns 400 when task status is not startable (done)', async () => {
    insertTask({ id: 't1', status: 'done' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not startable/)
  })

  it('returns 400 when task status is not startable (developing)', async () => {
    insertTask({ id: 't1', status: 'developing' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not startable/)
  })

  it('spawns with phase=brainstorm for idea status', async () => {
    insertTask({ id: 't1', status: 'idea', idea_file: '/tmp/idea.md' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'brainstorm',
        taskId: 't1',
        sourceFile: '/tmp/idea.md',
      }),
    )
  })

  it('spawns with phase=spec for spec status', async () => {
    insertTask({ id: 't1', status: 'spec', spec_file: '/tmp/spec.md' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'spec',
        taskId: 't1',
        sourceFile: '/tmp/spec.md',
      }),
    )
  })

  it('spawns with phase=develop for plan status', async () => {
    insertTask({ id: 't1', status: 'plan', plan_file: '/tmp/plan.md' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'develop',
        taskId: 't1',
        sourceFile: '/tmp/plan.md',
      }),
    )
  })

  it('uses label Start: <title>', async () => {
    insertTask({ id: 't1', status: 'idea', title: 'My New Feature' })
    await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(spawnSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Start: My New Feature' }),
    )
  })

  it('returns 409 when spawnSession throws CONCURRENT_SESSION', async () => {
    insertTask({ id: 't1', status: 'idea' })
    spawnSessionMock.mockRejectedValue(new Error('CONCURRENT_SESSION:existing-id'))
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.existingId).toBe('existing-id')
  })
})
