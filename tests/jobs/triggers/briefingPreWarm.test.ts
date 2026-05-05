import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initDb } from '@/lib/db'
import { briefingPreWarmTrigger } from '@/lib/jobs/triggers/briefingPreWarm'

describe('briefingPreWarmTrigger', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
      .run('p1', 'Test', '/tmp', new Date().toISOString())
    delete process.env.VITEST
    delete process.env.NODE_ENV
    vi.useFakeTimers()
  })

  afterEach(() => {
    process.env.VITEST = 'true'
    process.env.NODE_ENV = 'test'
    vi.useRealTimers()
  })

  it('no-ops when VITEST=true (env-gate)', () => {
    process.env.VITEST = 'true'
    vi.setSystemTime(new Date('2026-05-05T03:30:00.000Z'))  // 5:30am local (UTC+2)
    briefingPreWarmTrigger(db)
    const jobs = db.prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize'`).all()
    expect(jobs).toEqual([])
  })

  it('no-ops outside 5-6am window', () => {
    vi.setSystemTime(new Date('2026-05-05T09:00:00.000Z'))  // 11am local (UTC+2)
    briefingPreWarmTrigger(db)
    expect(db.prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize'`).all()).toEqual([])
  })

  it('enqueues per-project + __all__ jobs at 5am when no snapshot exists', () => {
    vi.setSystemTime(new Date('2026-05-05T03:30:00.000Z'))  // 5:30am local (UTC+2)
    briefingPreWarmTrigger(db)
    const jobs = db.prepare(`SELECT payload FROM pending_jobs WHERE kind = 'briefing_synthesize' ORDER BY id`).all() as Array<{ payload: string }>
    const scopes = jobs.map(j => JSON.parse(j.payload).scope).sort()
    expect(scopes).toContain('__all__')
    expect(scopes).toContain('p1')
  })

  it('skips scopes whose snapshot generated_at is today', () => {
    vi.setSystemTime(new Date('2026-05-05T03:30:00.000Z'))  // 5:30am local (UTC+2)
    db.prepare(`INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at) VALUES (?, ?, '', '[]', 'sig', 'mock', ?)`)
      .run('__all__', null, '2026-05-05T05:00:00.000Z')
    briefingPreWarmTrigger(db)
    const jobs = db.prepare(`SELECT payload FROM pending_jobs WHERE kind = 'briefing_synthesize'`).all() as Array<{ payload: string }>
    const scopes = jobs.map(j => JSON.parse(j.payload).scope)
    expect(scopes).not.toContain('__all__')  // already fresh today
    expect(scopes).toContain('p1')  // still needs to be enqueued
  })

  it('idempotent: second call does not enqueue duplicates', () => {
    vi.setSystemTime(new Date('2026-05-05T03:30:00.000Z'))  // 5:30am local (UTC+2)
    briefingPreWarmTrigger(db)
    briefingPreWarmTrigger(db)
    const jobs = db.prepare(`SELECT * FROM pending_jobs WHERE kind = 'briefing_synthesize'`).all()
    // Should be exactly 2 jobs (__all__ + p1), not 4
    expect(jobs.length).toBe(2)
  })
})
