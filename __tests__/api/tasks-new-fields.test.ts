import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

let db: Database
vi.mock('@/lib/db', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/db')>()
  return { ...orig, getDb: () => db }
})

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('POST /api/tasks — new fields', () => {
  it('accepts priority and stores it', async () => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p1', 'T', '/tmp/p1', new Date().toISOString())
    const { POST } = await import('@/app/api/tasks/route')
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p1', title: 'T', priority: 'high' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.priority).toBe('high')
  })

  it('accepts assignee_agent_id and stores it', async () => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p6', 'T', '/tmp/p6', new Date().toISOString())
    const { POST } = await import('@/app/api/tasks/route')
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p6', title: 'T', assignee_agent_id: 'agent-xyz' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.assignee_agent_id).toBe('agent-xyz')
  })

  it('accepts labels array and stores as JSON string', async () => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p2', 'T', '/tmp/p2', new Date().toISOString())
    const { POST } = await import('@/app/api/tasks/route')
    const req = new NextRequest('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'p2', title: 'T', labels: ['auth', 'backend'] }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.labels).toBe('["auth","backend"]')
  })
})

describe('PATCH /api/tasks/[id] — new fields', () => {
  it('patches priority', async () => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p3', 'T', '/tmp/p3', new Date().toISOString())
    db.prepare("INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?)").run('t1', 'p3', 'Task', new Date().toISOString(), new Date().toISOString())
    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const req = new NextRequest('http://localhost/api/tasks/t1', {
      method: 'PATCH',
      body: JSON.stringify({ priority: 'urgent' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 't1' }) })
    const body = await res.json()
    expect(body.priority).toBe('urgent')
  })

  it('patches assignee_agent_id', async () => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p4', 'T', '/tmp/p4', new Date().toISOString())
    db.prepare("INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?)").run('t2', 'p4', 'Task', new Date().toISOString(), new Date().toISOString())
    const { PATCH } = await import('@/app/api/tasks/[id]/route')
    const req = new NextRequest('http://localhost/api/tasks/t2', {
      method: 'PATCH',
      body: JSON.stringify({ assignee_agent_id: 'agent-abc' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 't2' }) })
    const body = await res.json()
    expect(body.assignee_agent_id).toBe('agent-abc')
  })
})

describe('GET /api/sessions — taskId + status=active filter', () => {
  beforeEach(() => {
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run('p5', 'T', '/tmp/p5', new Date().toISOString())
    db.prepare("INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?)").run('t3', 'p5', 'Task', new Date().toISOString(), new Date().toISOString())
    db.prepare("INSERT INTO sessions (id, project_id, task_id, label, phase, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run('s1', 'p5', 't3', 'L', 'brainstorm', 'active', new Date().toISOString())
    db.prepare("INSERT INTO sessions (id, project_id, task_id, label, phase, status, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('s2', 'p5', 't3', 'L', 'brainstorm', 'ended', new Date().toISOString(), new Date().toISOString())
  })

  it('returns only active sessions when status=active provided', async () => {
    const { GET } = await import('@/app/api/sessions/route')
    const req = new NextRequest('http://localhost/api/sessions?taskId=t3&status=active')
    const res = await GET(req)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('s1')
  })

  it('returns all task sessions when no status filter', async () => {
    const { GET } = await import('@/app/api/sessions/route')
    const req = new NextRequest('http://localhost/api/sessions?taskId=t3')
    const res = await GET(req)
    const body = await res.json()
    expect(body).toHaveLength(2)
  })
})
