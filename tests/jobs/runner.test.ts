import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb } from '@/lib/db'
import { enqueueJob, runOneBatch, registerHandler, clearHandlers } from '@/lib/jobs/runner'
import type { Database } from 'better-sqlite3'

let db: Database
beforeEach(() => {
  db = initDb(':memory:')
  clearHandlers()
})

describe('enqueueJob', () => {
  it('inserts a pending row', () => {
    enqueueJob(db, 'embed', { project_id: 'p1', kind: 'doc', ref: 'foo.md', content_hash: 'abc' }, { dedupKey: 'embed:p1:doc:foo.md' })
    const row = db.prepare(`SELECT kind, payload, dedup_key, state FROM pending_jobs`).get() as any
    expect(row.kind).toBe('embed')
    expect(row.state).toBe('pending')
    expect(row.dedup_key).toBe('embed:p1:doc:foo.md')
  })

  it('dedups when same dedup_key already pending', () => {
    enqueueJob(db, 'embed', { x: 1 }, { dedupKey: 'k' })
    enqueueJob(db, 'embed', { x: 2 }, { dedupKey: 'k' })
    const count = (db.prepare(`SELECT count(*) AS c FROM pending_jobs WHERE state = 'pending'`).get() as any).c
    expect(count).toBe(1)
  })

  it('does NOT dedup against done/failed rows', () => {
    enqueueJob(db, 'embed', { x: 1 }, { dedupKey: 'k' })
    db.prepare(`UPDATE pending_jobs SET state = 'done' WHERE dedup_key = 'k'`).run()
    enqueueJob(db, 'embed', { x: 2 }, { dedupKey: 'k' })
    const pending = (db.prepare(`SELECT count(*) AS c FROM pending_jobs WHERE state = 'pending'`).get() as any).c
    expect(pending).toBe(1)
  })
})

describe('runOneBatch', () => {
  it('claims pending and runs registered handler; marks done on success', async () => {
    const handler = vi.fn(async (_db, payload) => { expect(payload).toEqual({ x: 1 }) })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })  // very high cap → never gated
    expect(result.ran).toBe(1)
    expect(handler).toHaveBeenCalledOnce()
    const state = (db.prepare(`SELECT state FROM pending_jobs LIMIT 1`).get() as any).state
    expect(state).toBe('done')
  })

  it('on handler error, increments attempts and backs off', async () => {
    const handler = vi.fn(async () => { throw new Error('boom') })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, attempts, last_error FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('boom')
  })

  it('parks after 3 attempts', async () => {
    const handler = vi.fn(async () => { throw new Error('boom') })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    // Manually fast-forward attempts
    db.prepare(`UPDATE pending_jobs SET attempts = 2`).run()
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, attempts FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('failed')
    expect(row.attempts).toBe(3)
  })

  it('marks job failed when no handler registered', async () => {
    enqueueJob(db, 'embed', { x: 1 })
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, last_error FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('failed')
    expect(row.last_error).toMatch(/no handler/i)
  })

  it('skips when loadavg above threshold', async () => {
    const handler = vi.fn()
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    // loadAverageMax: 0 forces gate to fire
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 0 })
    expect(result.ran).toBe(0)
    expect(result.skipped).toBe('idle')
    expect(handler).not.toHaveBeenCalled()
  })

  it('respects batchSize cap', async () => {
    const handler = vi.fn(async () => {})
    registerHandler('embed', handler as any)
    for (let i = 0; i < 10; i++) enqueueJob(db, 'embed', { i })
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    expect(result.ran).toBe(4)
    expect(handler).toHaveBeenCalledTimes(4)
  })
})
