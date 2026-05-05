import { describe, it, expect, beforeEach, vi } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test Project', '/tmp/project', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

import { getDb } from '@/lib/db'
import { POST } from '../route'

function clearJobs() {
  getDb().prepare('DELETE FROM pending_jobs').run()
}

function makeRequest(scope?: string) {
  const url = scope
    ? `http://test/api/briefing/refresh?scope=${encodeURIComponent(scope)}`
    : 'http://test/api/briefing/refresh'
  return new Request(url, { method: 'POST' })
}

describe('POST /api/briefing/refresh', () => {
  beforeEach(() => {
    clearJobs()
  })

  it('returns 202 with { ok: true }', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('enqueues a briefing_synthesize job with :force-suffixed dedup_key', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await POST(makeRequest())

    const row = getDb()
      .prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize' LIMIT 1`)
      .get() as { kind: string; dedup_key: string; payload: string } | undefined
    expect(row).toBeTruthy()
    expect(row!.kind).toBe('briefing_synthesize')
    expect(row!.dedup_key).toBe(`briefing_synthesize:__all__:${today}:force`)
  })

  it('enqueues with the provided scope', async () => {
    const today = new Date().toISOString().slice(0, 10)
    await POST(makeRequest('my-project'))

    const row = getDb()
      .prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize' LIMIT 1`)
      .get() as { kind: string; dedup_key: string; payload: string } | undefined
    expect(row).toBeTruthy()
    expect(row!.dedup_key).toBe(`briefing_synthesize:my-project:${today}:force`)

    const payload = JSON.parse(row!.payload) as { scope: string }
    expect(payload.scope).toBe('my-project')
  })

  it('spam-clicks collapse to one job (two POSTs with same scope on same day)', async () => {
    await POST(makeRequest())
    await POST(makeRequest())

    const rows = getDb()
      .prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize'`)
      .all() as unknown[]
    expect(rows).toHaveLength(1)
  })

  it('spam-clicks with explicit scope also collapse to one job', async () => {
    await POST(makeRequest('p1'))
    await POST(makeRequest('p1'))

    const rows = getDb()
      .prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize'`)
      .all() as unknown[]
    expect(rows).toHaveLength(1)
  })
})
