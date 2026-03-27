import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, _resetDbSingleton } from '@/lib/db'
import { logEvent, getRecentEvents } from '@/lib/events'
import type Database from 'better-sqlite3'

describe('events', () => {
  let db: Database.Database

  beforeEach(() => {
    _resetDbSingleton()
    db = initDb(':memory:')
  })

  afterEach(() => {
    db.close()
    _resetDbSingleton()
  })

  it('logEvent inserts and getRecentEvents retrieves', () => {
    logEvent(db, { projectId: 'p1', type: 'session_started', summary: 'Started develop session', severity: 'info' })
    logEvent(db, { projectId: 'p1', type: 'audit_completed', summary: 'Audit found 2 blockers', severity: 'warn' })

    const events = getRecentEvents(db, 10)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('audit_completed')
    expect(events[1].type).toBe('session_started')
  })

  it('getRecentEvents respects limit', () => {
    for (let i = 0; i < 5; i++) {
      logEvent(db, { projectId: 'p1', type: 'test', summary: `event ${i}`, severity: 'info' })
    }
    expect(getRecentEvents(db, 3)).toHaveLength(3)
  })

  it('getRecentEvents filters by projectId', () => {
    logEvent(db, { projectId: 'p1', type: 'a', summary: 'for p1', severity: 'info' })
    logEvent(db, { projectId: 'p2', type: 'b', summary: 'for p2', severity: 'info' })

    const events = getRecentEvents(db, 10, 'p1')
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBe('for p1')
  })
})
