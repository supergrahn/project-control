import { describe, it, expect, beforeEach, vi } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test Project', '/tmp/project', new Date().toISOString())
  // Insert a critic_findings row with kind='spec' and two issues
  db.prepare(`
    INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'p1',
    'spec',
    'spec.md',
    'abc123',
    JSON.stringify({
      issues: [
        { severity: 'critical', category: 'clarity', message: 'Section is ambiguous' },
        { severity: 'high', category: 'completeness', message: 'Missing acceptance criteria' },
      ],
      votes: 1,
      model: 'test-model',
      run_at: new Date().toISOString(),
    }),
    new Date().toISOString(),
  )
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
import { POST } from '../fix/route'

function makeRequest(body?: unknown) {
  if (body === undefined) {
    return new Request('http://test/api/critic-findings/1/fix', { method: 'POST' })
  }
  return new Request('http://test/api/critic-findings/1/fix', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validBody() {
  return {
    category: 'clarity',
    message: 'Section is ambiguous',
    severity: 'critical',
  }
}

describe('POST /api/critic-findings/[id]/fix', () => {
  beforeEach(() => {
    spawnSessionMock.mockReset()
    spawnSessionMock.mockResolvedValue('new-session-id')
  })

  it('returns 400 for missing body (no JSON)', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid JSON body/)
  })

  it('returns 400 for malformed JSON body (array)', async () => {
    const req = new Request('http://test/api/critic-findings/1/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[]',
    })
    const res = await POST(req, { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid JSON body/)
  })

  it('returns 400 for non-integer id', async () => {
    const res = await POST(makeRequest(validBody()), { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid id/)
  })

  it('returns 400 for missing category', async () => {
    const res = await POST(
      makeRequest({ message: 'Section is ambiguous', severity: 'critical' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/category/)
  })

  it('returns 400 for missing message', async () => {
    const res = await POST(
      makeRequest({ category: 'clarity', severity: 'critical' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/message/)
  })

  it('returns 400 for missing severity', async () => {
    const res = await POST(
      makeRequest({ category: 'clarity', message: 'Section is ambiguous' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/severity/)
  })

  it('returns 400 when severity is not critical or high', async () => {
    const res = await POST(
      makeRequest({ category: 'clarity', message: 'Section is ambiguous', severity: 'low' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/severity must be critical or high/)
  })

  it('returns 404 when finding not found', async () => {
    const res = await POST(makeRequest(validBody()), { params: Promise.resolve({ id: '9999' }) })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/finding not found/)
  })

  it('returns 400 when finding kind is not spec or plan', async () => {
    // Insert a finding with kind='other'
    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'p1',
      'other',
      'other.md',
      'def456',
      JSON.stringify({ issues: [{ severity: 'critical', category: 'clarity', message: 'Section is ambiguous' }] }),
      new Date().toISOString(),
    )
    const badId = (db.prepare('SELECT id FROM critic_findings WHERE kind = ?').get('other') as { id: number }).id
    const res = await POST(makeRequest(validBody()), { params: Promise.resolve({ id: String(badId) }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/kind must be spec or plan/)
  })

  it('returns 400 when trio is not in stored issues', async () => {
    const res = await POST(
      makeRequest({ category: 'clarity', message: 'Wrong message', severity: 'critical' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/issue not found in finding/)
  })

  it('200 happy path returns correct sessionId', async () => {
    const res = await POST(makeRequest(validBody()), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        phase: 'spec',
        label: 'Fix critic finding: clarity',
      }),
    )
  })

  it('200 happy path also works for high severity', async () => {
    const res = await POST(
      makeRequest({ category: 'completeness', message: 'Missing acceptance criteria', severity: 'high' }),
      { params: Promise.resolve({ id: '1' }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
  })

  it('returns 409 when spawnSession throws CONCURRENT_SESSION', async () => {
    spawnSessionMock.mockRejectedValue(new Error('CONCURRENT_SESSION:existing-session-id'))
    const res = await POST(makeRequest(validBody()), { params: Promise.resolve({ id: '1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.existingId).toBe('existing-session-id')
  })
})
