import { describe, it, expect, vi, beforeEach } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Project One', '/tmp/p1', new Date().toISOString())
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p2', 'Project Two', '/tmp/p2', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

// Mock duplicateTasks to throw — used in the resilience test
vi.mock('@/lib/briefing/duplicateTasks', () => ({
  getDuplicateTasks: vi.fn(() => { throw new Error('boom') }),
}))

import { GET } from '../route'
import { sectionSignature } from '@/lib/briefing/sectionSignature'

function makeReq(url = 'http://localhost/api/briefing'): Request {
  return new Request(url)
}

describe('GET /api/briefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct shape with all 5 keys and generatedAt on empty DB', async () => {
    // Re-import the mock to reset to throwing state
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET(makeReq())
    const body = await res.json()

    expect(body).toHaveProperty('openNextActions')
    expect(body).toHaveProperty('criticFlagged')
    expect(body).toHaveProperty('topTasks')
    expect(body).toHaveProperty('recentFailures')
    expect(body).toHaveProperty('duplicateTasks')
    expect(body).toHaveProperty('generatedAt')
  })

  it('returns all empty arrays when DB is empty and duplicateTasks throws', async () => {
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET(makeReq())
    const body = await res.json()

    expect(body.openNextActions).toEqual([])
    expect(body.criticFlagged).toEqual([])
    expect(body.topTasks).toEqual([])
    expect(body.recentFailures).toEqual([])
    expect(body.duplicateTasks).toEqual([])
    expect(typeof body.generatedAt).toBe('string')
  })

  it('other sections still populate when duplicateTasks throws', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()

    // Seed a task so topTasks section returns data
    const now = new Date().toISOString()
    db.prepare(`INSERT OR IGNORE INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('t1', 'p1', 'Build feature', 'plan', now, now)

    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET(makeReq())
    const body = await res.json()

    // topTasks should have data even though duplicateTasks threw
    expect(body.topTasks.length).toBeGreaterThanOrEqual(1)
    expect(body.duplicateTasks).toEqual([])
    expect(body.generatedAt).toBeTruthy()
  })

  it('generatedAt is a valid ISO string', async () => {
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET(makeReq())
    const body = await res.json()

    expect(() => new Date(body.generatedAt)).not.toThrow()
    expect(new Date(body.generatedAt).getFullYear()).toBeGreaterThan(2020)
  })

  // ── NEW TESTS ──────────────────────────────────────────────────────────────

  it('?projectId=p1 filters sections to p1 data only', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()

    // Seed tasks for both projects
    db.prepare(`INSERT OR IGNORE INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('t-p1', 'p1', 'Task for p1', 'plan', now, now)
    db.prepare(`INSERT OR IGNORE INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('t-p2', 'p2', 'Task for p2', 'plan', now, now)

    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const res = await GET(makeReq('http://localhost/api/briefing?projectId=p1'))
    const body = await res.json()

    // All topTasks should be from p1 only
    const allProjectIds = body.topTasks.map((t: { projectId: string }) => t.projectId)
    expect(allProjectIds.every((pid: string) => pid === 'p1')).toBe(true)
    expect(allProjectIds).not.toContain('p2')
  })

  it('returns snapshot in response when a snapshot row exists', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    // Compute a current signature so the snapshot is not stale by drift
    const emptySections = {
      openNextActions: [], criticFlagged: [], topTasks: [], recentFailures: [], duplicateTasks: [],
    }
    const sig = sectionSignature(emptySections)
    const generatedAt = new Date().toISOString()
    const priorityActions = JSON.stringify([{ sectionKey: 'topTasks', refId: 't1', reason: 'high priority' }])

    db.prepare(`INSERT OR REPLACE INTO briefing_snapshots (scope_key, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run('__all__', 'This is the narrative.', priorityActions, sig, 'gpt-4o', generatedAt)

    const res = await GET(makeReq('http://localhost/api/briefing'))
    const body = await res.json()

    expect(body.snapshot).not.toBeNull()
    expect(body.snapshot.narrative).toBe('This is the narrative.')
    expect(body.snapshot.priorityActions).toHaveLength(1)
    expect(body.snapshot.priorityActions[0].sectionKey).toBe('topTasks')
    expect(body.snapshot.model).toBe('gpt-4o')
    expect(body.snapshot.generatedAt).toBe(generatedAt)
  })

  it('snapshotStale is true when no snapshot exists for scope', async () => {
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    // Use a scope that definitely has no snapshot
    const res = await GET(makeReq('http://localhost/api/briefing?projectId=no-snap-scope'))
    const body = await res.json()

    expect(body.snapshotStale).toBe(true)
    expect(body.snapshot).toBeNull()
  })

  it('snapshotStale is true when snapshot is older than 18 hours', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const oldDate = new Date(Date.now() - 19 * 3_600_000).toISOString()
    const emptySections = { openNextActions: [], criticFlagged: [], topTasks: [], recentFailures: [], duplicateTasks: [] }
    const sig = sectionSignature(emptySections)

    db.prepare(`INSERT OR REPLACE INTO briefing_snapshots (scope_key, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run('stale-age-scope', 'Old narrative.', '[]', sig, 'model', oldDate)

    const res = await GET(makeReq('http://localhost/api/briefing?projectId=stale-age-scope'))
    const body = await res.json()

    expect(body.snapshotStale).toBe(true)
  })

  it('snapshotStale is true when snapshot section_signature differs from current', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const recentDate = new Date().toISOString()
    // Store a deliberately wrong signature
    db.prepare(`INSERT OR REPLACE INTO briefing_snapshots (scope_key, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run('drift-scope', 'Narrative.', '[]', 'old-sig-that-will-not-match', 'model', recentDate)

    const res = await GET(makeReq('http://localhost/api/briefing?projectId=drift-scope'))
    const body = await res.json()

    expect(body.snapshotStale).toBe(true)
  })

  it('snapshotStale is false when snapshot is fresh and signature matches', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const emptySections = { openNextActions: [], criticFlagged: [], topTasks: [], recentFailures: [], duplicateTasks: [] }
    const sig = sectionSignature(emptySections)
    const recentDate = new Date().toISOString()

    db.prepare(`INSERT OR REPLACE INTO briefing_snapshots (scope_key, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run('fresh-scope', 'Fresh narrative.', '[]', sig, 'model', recentDate)

    const res = await GET(makeReq('http://localhost/api/briefing?projectId=fresh-scope'))
    const body = await res.json()

    expect(body.snapshotStale).toBe(false)
  })

  it('stale path: a pending_jobs row is inserted with the correct dedup_key', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const today = new Date().toISOString().slice(0, 10)
    const scope = 'enqueue-test-scope'
    const expectedKey = `briefing_synthesize:${scope}:${today}`

    // Ensure no prior job row for this key
    db.prepare(`DELETE FROM pending_jobs WHERE dedup_key = ?`).run(expectedKey)

    const res = await GET(makeReq(`http://localhost/api/briefing?projectId=${scope}`))
    const body = await res.json()

    expect(body.snapshotStale).toBe(true)

    const row = db.prepare(`SELECT * FROM pending_jobs WHERE dedup_key = ?`).get(expectedKey) as { dedup_key: string; kind: string; state: string } | undefined
    expect(row).toBeDefined()
    expect(row?.kind).toBe('briefing_synthesize')
    expect(row?.state).toBe('pending')
  })

  it('lazy enqueue dedup: two GETs in quick succession produce only one pending_jobs row', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementation(() => [])

    const today = new Date().toISOString().slice(0, 10)
    const scope = 'dedup-test-scope'
    const expectedKey = `briefing_synthesize:${scope}:${today}`

    // Ensure no prior job row for this key
    db.prepare(`DELETE FROM pending_jobs WHERE dedup_key = ?`).run(expectedKey)

    await GET(makeReq(`http://localhost/api/briefing?projectId=${scope}`))
    await GET(makeReq(`http://localhost/api/briefing?projectId=${scope}`))

    const rows = db.prepare(`SELECT * FROM pending_jobs WHERE dedup_key = ?`).all(expectedKey) as unknown[]
    expect(rows).toHaveLength(1)
  })
})
