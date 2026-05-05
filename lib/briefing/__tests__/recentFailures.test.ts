import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getRecentFailures } from '../recentFailures'

function insertProject(db: ReturnType<typeof initDb>, id: string, name = id) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(id, name, `/tmp/${id}`, new Date().toISOString())
}

function insertSession(db: ReturnType<typeof initDb>, opts: {
  id: string
  projectId: string
  label?: string
  grade?: string | null
  gradeReason?: string | null
  gradedAt?: string | null
}) {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, status, grade, grade_reason, graded_at, created_at)
              VALUES (?, ?, ?, 'spec', 'ended', ?, ?, ?, ?)`).run(
    opts.id,
    opts.projectId,
    opts.label ?? `lbl-${opts.id}`,
    opts.grade ?? null,
    opts.gradeReason ?? null,
    opts.gradedAt ?? null,
    new Date().toISOString(),
  )
}

describe('getRecentFailures', () => {
  let db: ReturnType<typeof initDb>
  const now = new Date('2026-05-05T00:00:00.000Z')

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1', 'Project One')
  })

  it('returns empty when no sessions', () => {
    expect(getRecentFailures(db, { now })).toEqual([])
  })

  it('returns sessions with grade "no"', () => {
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      grade: 'no',
      gradedAt: '2026-05-04T00:00:00.000Z',
    })
    const out = getRecentFailures(db, { now })
    expect(out).toHaveLength(1)
    expect(out[0].grade).toBe('no')
  })

  it('returns sessions with grade "partial"', () => {
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      grade: 'partial',
      gradedAt: '2026-05-04T00:00:00.000Z',
    })
    const out = getRecentFailures(db, { now })
    expect(out).toHaveLength(1)
    expect(out[0].grade).toBe('partial')
  })

  it('excludes successful sessions (grade "yes")', () => {
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      grade: 'yes',
      gradedAt: '2026-05-04T00:00:00.000Z',
    })
    expect(getRecentFailures(db, { now })).toEqual([])
  })

  it('excludes ungraded sessions', () => {
    insertSession(db, { id: 's1', projectId: 'p1', grade: null, gradedAt: null })
    expect(getRecentFailures(db, { now })).toEqual([])
  })

  it('skips sessions older than lookback window', () => {
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      grade: 'no',
      gradedAt: '2026-04-01T00:00:00.000Z',
    })
    expect(getRecentFailures(db, { now, lookbackDays: 7 })).toEqual([])
  })

  it('orders by graded_at DESC', () => {
    insertSession(db, { id: 'old', projectId: 'p1', grade: 'no', gradedAt: '2026-05-01T00:00:00.000Z' })
    insertSession(db, { id: 'new', projectId: 'p1', grade: 'partial', gradedAt: '2026-05-04T00:00:00.000Z' })
    const out = getRecentFailures(db, { now })
    expect(out[0].sessionId).toBe('new')
    expect(out[1].sessionId).toBe('old')
  })

  it('respects limit option', () => {
    for (let i = 0; i < 12; i++) {
      insertSession(db, {
        id: `s${i}`,
        projectId: 'p1',
        grade: 'no',
        gradedAt: `2026-05-04T00:0${String(i).padStart(2,'0')}:00.000Z`,
      })
    }
    expect(getRecentFailures(db, { now, limit: 5 })).toHaveLength(5)
  })

  it('includes gradeReason and projectName', () => {
    insertSession(db, {
      id: 's1',
      projectId: 'p1',
      grade: 'no',
      gradeReason: 'Tests failed',
      gradedAt: '2026-05-04T00:00:00.000Z',
    })
    const out = getRecentFailures(db, { now })
    expect(out[0].gradeReason).toBe('Tests failed')
    expect(out[0].projectName).toBe('Project One')
  })
})
