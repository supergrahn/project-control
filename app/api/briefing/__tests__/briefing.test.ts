import { describe, it, expect, vi, beforeEach } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test', '/tmp', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

// Mock duplicateTasks to throw — used in the resilience test
vi.mock('@/lib/briefing/duplicateTasks', () => ({
  getDuplicateTasks: vi.fn(() => { throw new Error('boom') }),
}))

import { GET } from '../route'

describe('GET /api/briefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct shape with all 5 keys and generatedAt on empty DB', async () => {
    // Re-import the mock to reset to throwing state
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET()
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

    const res = await GET()
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
    db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run('t1', 'p1', 'Build feature', 'plan', now, now)

    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET()
    const body = await res.json()

    // topTasks should have data even though duplicateTasks threw
    expect(body.topTasks).toHaveLength(1)
    expect(body.duplicateTasks).toEqual([])
    expect(body.generatedAt).toBeTruthy()
  })

  it('generatedAt is a valid ISO string', async () => {
    const { getDuplicateTasks } = await import('@/lib/briefing/duplicateTasks')
    vi.mocked(getDuplicateTasks).mockImplementationOnce(() => { throw new Error('boom') })

    const res = await GET()
    const body = await res.json()

    expect(() => new Date(body.generatedAt)).not.toThrow()
    expect(new Date(body.generatedAt).getFullYear()).toBeGreaterThan(2020)
  })
})
