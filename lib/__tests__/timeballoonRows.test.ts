import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import {
  upsertTimesheetRow,
  upsertProjectAlias,
  upsertKnownProject,
  upsertRowFeedback,
  upsertGapHint,
  markDeleted,
  isOutboxSeen,
  markOutboxSeen,
  getStateSince,
} from '@/lib/db/timeballoonRows'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

function timesheetPayload(uuid: string, updatedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    uuid,
    date: '2026-05-21',
    signature: 'git:/x',
    project: 'TimeBalloon',
    work_type: 'Development',
    total_seconds: 3600,
    description: 'Implemented sync',
    status: 'provisional',
    confidence: 0.5,
    task_ref: null,
    updated_at: updatedAt,
    ...overrides,
  }
}

describe('upsertTimesheetRow', () => {
  it('inserts a new row and returns applied', () => {
    const out = upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T10:00:00Z'))
    expect(out).toBe('applied')
    const row = db.prepare('SELECT * FROM timeballoon_daily_timesheet WHERE uuid = ?').get('a') as { project: string }
    expect(row.project).toBe('TimeBalloon')
  })

  it('updates existing row when incoming updated_at is newer', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T10:00:00Z'))
    const out = upsertTimesheetRow(
      db,
      timesheetPayload('a', '2026-05-21T11:00:00Z', { description: 'Refactored' }),
    )
    expect(out).toBe('applied')
    const row = db.prepare('SELECT description FROM timeballoon_daily_timesheet WHERE uuid = ?').get('a') as { description: string }
    expect(row.description).toBe('Refactored')
  })

  it('skips stale upserts (incoming older than existing)', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T11:00:00Z'))
    const out = upsertTimesheetRow(
      db,
      timesheetPayload('a', '2026-05-21T10:00:00Z', { description: 'Stale write' }),
    )
    expect(out).toBe('skipped_stale')
    const row = db.prepare('SELECT description FROM timeballoon_daily_timesheet WHERE uuid = ?').get('a') as { description: string }
    expect(row.description).toBe('Implemented sync')  // unchanged
  })

  it('rejects malformed payloads', () => {
    expect(() => upsertTimesheetRow(db, { uuid: 'a' })).toThrow()
  })
})

describe('markDeleted', () => {
  it('soft-deletes by uuid and bumps updated_at', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T10:00:00Z'))
    const out = markDeleted(db, 'daily_timesheet', 'a')
    expect(out).toBe('applied')
    const row = db.prepare('SELECT is_deleted, updated_at FROM timeballoon_daily_timesheet WHERE uuid = ?').get('a') as { is_deleted: number; updated_at: string }
    expect(row.is_deleted).toBe(1)
    expect(row.updated_at > '2026-05-21T10:00:00Z').toBe(true)
  })

  it('is a no-op when the row does not exist', () => {
    expect(markDeleted(db, 'daily_timesheet', 'nonexistent')).toBe('noop')
  })

  it('is a no-op when the row is already deleted', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T10:00:00Z'))
    markDeleted(db, 'daily_timesheet', 'a')
    expect(markDeleted(db, 'daily_timesheet', 'a')).toBe('noop')
  })
})

describe('outbox-seen idempotency', () => {
  it('isOutboxSeen returns false then true after markOutboxSeen', () => {
    expect(isOutboxSeen(db, 'evt-1')).toBe(false)
    markOutboxSeen(db, 'evt-1')
    expect(isOutboxSeen(db, 'evt-1')).toBe(true)
  })

  it('markOutboxSeen is itself idempotent (no error on repeat)', () => {
    markOutboxSeen(db, 'evt-1')
    expect(() => markOutboxSeen(db, 'evt-1')).not.toThrow()
  })
})

describe('upsertProjectAlias', () => {
  it('inserts and uses last_used as the freshness signal', () => {
    const out = upsertProjectAlias(db, {
      uuid: 'al-1',
      signature: 'git:/repo',
      marathon_project: 'Marathon',
      marathon_work_type: 'Dev',
      last_used: '2026-05-21T09:00:00Z',
    })
    expect(out).toBe('applied')
  })
})

describe('upsertGapHint', () => {
  it('inserts and uses last_picked as the freshness signal', () => {
    const out = upsertGapHint(db, {
      uuid: 'g-1',
      hour_of_day: 11,
      label: 'Standup',
      category: 'Meetings',
      picked_count: 3,
      last_picked: '2026-05-21T11:30:00Z',
    })
    expect(out).toBe('applied')
  })
})

describe('upsertKnownProject', () => {
  it('inserts with default empty keywords', () => {
    const out = upsertKnownProject(db, {
      uuid: 'k-1',
      name: 'russ-community',
      work_type: 'Backend',
      updated_at: '2026-05-21T10:00:00Z',
    })
    expect(out).toBe('applied')
    const row = db.prepare('SELECT keywords FROM timeballoon_known_projects WHERE uuid = ?').get('k-1') as { keywords: string }
    expect(row.keywords).toBe('')
  })
})

describe('upsertRowFeedback', () => {
  it('accepts timesheet_row_uuid when supplied', () => {
    const out = upsertRowFeedback(db, {
      uuid: 'rf-1',
      timesheet_row_uuid: 'ts-row-1',
      score: 1,
      created_at: '2026-05-21T10:00:00Z',
    })
    expect(out).toBe('applied')
  })

  it('falls back to timesheet_row_id stringified', () => {
    const out = upsertRowFeedback(db, {
      uuid: 'rf-2',
      timesheet_row_id: 42,
      score: -1,
      created_at: '2026-05-21T10:00:00Z',
    })
    expect(out).toBe('applied')
    const row = db.prepare('SELECT timesheet_row_uuid FROM timeballoon_row_feedback WHERE uuid = ?').get('rf-2') as { timesheet_row_uuid: string }
    expect(row.timesheet_row_uuid).toBe('42')
  })
})

describe('getStateSince', () => {
  it('returns rows changed strictly after the cutoff, grouped by table', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T08:00:00Z'))
    upsertTimesheetRow(db, timesheetPayload('b', '2026-05-21T10:00:00Z'))
    upsertProjectAlias(db, {
      uuid: 'al-1',
      signature: 'git:/x',
      marathon_project: 'M',
      marathon_work_type: 'Dev',
      last_used: '2026-05-21T09:00:00Z',
    })

    const state = getStateSince(db, '2026-05-21T08:30:00Z')
    expect(state.daily_timesheet).toHaveLength(1)
    expect((state.daily_timesheet[0] as { uuid: string }).uuid).toBe('b')
    expect(state.project_aliases).toHaveLength(1)
    expect(state.known_projects).toHaveLength(0)
  })

  it('returns everything when since is the epoch', () => {
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T08:00:00Z'))
    upsertTimesheetRow(db, timesheetPayload('b', '2026-05-21T10:00:00Z'))
    const state = getStateSince(db, '1970-01-01T00:00:00Z')
    expect(state.daily_timesheet).toHaveLength(2)
  })

  it('orders rows by updated_at ASC so Mac can apply oldest-first', () => {
    upsertTimesheetRow(db, timesheetPayload('b', '2026-05-21T10:00:00Z'))
    upsertTimesheetRow(db, timesheetPayload('a', '2026-05-21T08:00:00Z'))
    const state = getStateSince(db, '1970-01-01T00:00:00Z')
    const ts = state.daily_timesheet as { uuid: string }[]
    expect(ts.map(r => r.uuid)).toEqual(['a', 'b'])
  })
})
