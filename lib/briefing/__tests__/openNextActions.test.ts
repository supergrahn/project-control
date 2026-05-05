// lib/briefing/__tests__/openNextActions.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getOpenNextActions } from '../openNextActions'

function nextActionsJson(actions: string[], questions: string[] = []) {
  return JSON.stringify({
    next_actions: actions,
    open_questions: questions,
    files_touched: [],
    extracted_at: new Date().toISOString(),
    model: 'llama3',
  })
}

function insertProject(db: ReturnType<typeof initDb>, id: string, name = id) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(id, name, `/tmp/${id}`, new Date().toISOString())
}

function insertSession(db: ReturnType<typeof initDb>, opts: {
  id: string; projectId: string; status?: string; nextActions?: string | null; endedAt?: string | null;
}) {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, status, next_actions, created_at, ended_at)
              VALUES (?, ?, ?, 'spec', ?, ?, ?, ?)`).run(
    opts.id, opts.projectId, `lbl-${opts.id}`, opts.status ?? 'ended',
    opts.nextActions ?? null, '2026-05-01T00:00:00.000Z', opts.endedAt ?? '2026-05-01T00:01:00.000Z',
  )
}

describe('getOpenNextActions', () => {
  let db: ReturnType<typeof initDb>
  const now = new Date('2026-05-05T00:00:00.000Z')

  beforeEach(() => { db = initDb(':memory:'); insertProject(db, 'p1') })

  it('returns empty when no rows match', () => {
    expect(getOpenNextActions(db, { now })).toEqual([])
  })

  it('returns one item with parsed actions', () => {
    insertSession(db, { id: 's1', projectId: 'p1', nextActions: nextActionsJson(['a', 'b']) })
    const out = getOpenNextActions(db, { now })
    expect(out).toHaveLength(1)
    expect(out[0].actions).toEqual(['a', 'b'])
    expect(out[0].projectName).toBe('p1')
  })

  it('skips active sessions', () => {
    insertSession(db, { id: 's1', projectId: 'p1', status: 'active', nextActions: nextActionsJson(['a']) })
    expect(getOpenNextActions(db, { now })).toEqual([])
  })

  it('skips sessions older than lookback window', () => {
    insertSession(db, { id: 's1', projectId: 'p1', nextActions: nextActionsJson(['a']), endedAt: '2026-04-01T00:00:00.000Z' })
    expect(getOpenNextActions(db, { now, lookbackDays: 14 })).toEqual([])
  })

  it('skips rows with empty arrays', () => {
    insertSession(db, { id: 's1', projectId: 'p1', nextActions: nextActionsJson([], []) })
    expect(getOpenNextActions(db, { now })).toEqual([])
  })

  it('caps actions at top 3 per session', () => {
    insertSession(db, { id: 's1', projectId: 'p1', nextActions: nextActionsJson(['a','b','c','d','e']) })
    expect(getOpenNextActions(db, { now })[0].actions).toEqual(['a','b','c'])
  })

  it('respects limit option', () => {
    for (let i = 0; i < 12; i++) {
      insertSession(db, {
        id: `s${i}`, projectId: 'p1', nextActions: nextActionsJson(['x']),
        endedAt: `2026-05-04T00:0${i}:00.000Z`,
      })
    }
    expect(getOpenNextActions(db, { now, limit: 5 })).toHaveLength(5)
  })

  it('orders by ended_at DESC', () => {
    insertSession(db, { id: 'old', projectId: 'p1', nextActions: nextActionsJson(['a']), endedAt: '2026-05-01T00:00:00.000Z' })
    insertSession(db, { id: 'new', projectId: 'p1', nextActions: nextActionsJson(['a']), endedAt: '2026-05-04T00:00:00.000Z' })
    const out = getOpenNextActions(db, { now })
    expect(out[0].sessionId).toBe('new')
    expect(out[1].sessionId).toBe('old')
  })

  it('filters by projectId when provided', () => {
    insertProject(db, 'p2')
    insertSession(db, { id: 's1', projectId: 'p1', nextActions: nextActionsJson(['a']) })
    insertSession(db, { id: 's2', projectId: 'p2', nextActions: nextActionsJson(['b']) })
    const out = getOpenNextActions(db, { projectId: 'p1', now })
    expect(out.every(x => x.projectId === 'p1')).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })
})
