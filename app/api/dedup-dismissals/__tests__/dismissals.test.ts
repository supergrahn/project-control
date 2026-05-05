import { describe, it, expect, beforeEach } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test Project', '/tmp/project', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

import { vi } from 'vitest'
import { getDb } from '@/lib/db'
import { POST } from '../route'

function clearDismissals() {
  getDb().prepare('DELETE FROM dedup_dismissals').run()
}

function makeRequest(body?: unknown) {
  if (body === undefined) {
    return new Request('http://test/api/dedup-dismissals', { method: 'POST' })
  }
  return new Request('http://test/api/dedup-dismissals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/dedup-dismissals', () => {
  beforeEach(() => {
    clearDismissals()
  })

  it('returns 400 for invalid JSON body (no body)', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid JSON body/)
  })

  it('returns 400 for invalid JSON body (array)', async () => {
    const req = new Request('http://test/api/dedup-dismissals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[]',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid JSON body/)
  })

  it('returns 400 for missing projectId', async () => {
    const res = await POST(makeRequest({ aTaskId: 'A', bTaskId: 'B' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/projectId/)
  })

  it('returns 400 for missing aTaskId', async () => {
    const res = await POST(makeRequest({ projectId: 'p1', bTaskId: 'B' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/aTaskId/)
  })

  it('returns 400 for missing bTaskId', async () => {
    const res = await POST(makeRequest({ projectId: 'p1', aTaskId: 'A' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/bTaskId/)
  })

  it('returns 400 when aTaskId equals bTaskId', async () => {
    const res = await POST(makeRequest({ projectId: 'p1', aTaskId: 'A', bTaskId: 'A' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/must differ/)
  })

  it('200 happy path stores a row in dedup_dismissals', async () => {
    const res = await POST(makeRequest({ projectId: 'p1', aTaskId: 'A', bTaskId: 'B' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const row = getDb()
      .prepare('SELECT * FROM dedup_dismissals WHERE project_id = ? AND a_task_id = ? AND b_task_id = ?')
      .get('p1', 'A', 'B') as { project_id: string; a_task_id: string; b_task_id: string } | undefined
    expect(row).toBeTruthy()
    expect(row!.a_task_id).toBe('A')
    expect(row!.b_task_id).toBe('B')
  })

  it('200 idempotent — calling twice with same input yields only one row', async () => {
    await POST(makeRequest({ projectId: 'p1', aTaskId: 'A', bTaskId: 'B' }))
    const res = await POST(makeRequest({ projectId: 'p1', aTaskId: 'A', bTaskId: 'B' }))
    expect(res.status).toBe(200)

    const rows = getDb()
      .prepare('SELECT * FROM dedup_dismissals WHERE project_id = ? AND a_task_id = ? AND b_task_id = ?')
      .all('p1', 'A', 'B') as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('200 canonicalises order — POST {aTaskId: B, bTaskId: A} stores (A, B)', async () => {
    const res = await POST(makeRequest({ projectId: 'p1', aTaskId: 'B', bTaskId: 'A' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const row = getDb()
      .prepare('SELECT * FROM dedup_dismissals WHERE project_id = ?')
      .get('p1') as { a_task_id: string; b_task_id: string } | undefined
    expect(row).toBeTruthy()
    expect(row!.a_task_id).toBe('A')
    expect(row!.b_task_id).toBe('B')
  })
})
