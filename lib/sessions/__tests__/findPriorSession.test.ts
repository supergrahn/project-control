import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import type Database from 'better-sqlite3'
import { findPriorSessionWithNextActions } from '../findPriorSession'

function nextActionsJson(next_actions: string[], open_questions: string[] = []): string {
  return JSON.stringify({
    next_actions,
    open_questions,
    files_touched: [],
    extracted_at: new Date().toISOString(),
    model: 'llama3',
  })
}

function insertProject(db: Database.Database, id: string) {
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, id, `/tmp/${id}`, new Date().toISOString())
}

function insertTask(db: Database.Database, id: string, projectId: string) {
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?)`)
    .run(id, projectId, `task-${id}`, now, now)
}

function insertSession(db: Database.Database, opts: {
  id: string
  projectId: string
  status?: 'active' | 'ended' | 'failed'
  taskId?: string | null
  sourceFile?: string | null
  nextActions?: string | null
  createdAt?: string
  endedAt?: string | null
}) {
  const createdAt = opts.createdAt ?? new Date().toISOString()
  db.prepare(`INSERT INTO sessions
    (id, project_id, label, phase, status, source_file, task_id, next_actions, created_at, ended_at)
    VALUES (?, ?, ?, 'spec', ?, ?, ?, ?, ?, ?)`).run(
    opts.id,
    opts.projectId,
    `label-${opts.id}`,
    opts.status ?? 'ended',
    opts.sourceFile ?? null,
    opts.taskId ?? null,
    opts.nextActions ?? null,
    createdAt,
    opts.endedAt ?? null,
  )
}

describe('findPriorSessionWithNextActions', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1')
    insertTask(db, 't1', 'p1')
  })

  it('returns null when neither taskId nor sourceFile provided', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['x']) })
    expect(findPriorSessionWithNextActions(db, {})).toBeNull()
  })

  it('matches by taskId', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['x']) })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s1')
  })

  it('matches by sourceFile', () => {
    insertSession(db, { id: 's1', projectId: 'p1', sourceFile: '/tmp/a.md', nextActions: nextActionsJson(['x']) })
    const found = findPriorSessionWithNextActions(db, { sourceFile: '/tmp/a.md' })
    expect(found?.id).toBe('s1')
  })

  it('sourceFile takes precedence when both provided', () => {
    insertSession(db, { id: 's-task', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['by-task']) })
    insertSession(db, { id: 's-file', projectId: 'p1', sourceFile: '/tmp/a.md', nextActions: nextActionsJson(['by-file']) })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1', sourceFile: '/tmp/a.md' })
    expect(found?.id).toBe('s-file')
  })

  it('excludes status="active" sessions', () => {
    insertSession(db, { id: 's-active', projectId: 'p1', status: 'active', taskId: 't1', nextActions: nextActionsJson(['x']) })
    expect(findPriorSessionWithNextActions(db, { taskId: 't1' })).toBeNull()
  })

  it('excludes sessions with null next_actions', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: null })
    expect(findPriorSessionWithNextActions(db, { taskId: 't1' })).toBeNull()
  })

  it('walks past most-recent ended session if its arrays are empty', () => {
    insertSession(db, { id: 's-old', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['has-action']), createdAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z' })
    insertSession(db, { id: 's-new', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson([], []), createdAt: '2026-01-02T00:00:00.000Z', endedAt: '2026-01-02T00:01:00.000Z' })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s-old')
  })

  it('orders by ended_at DESC (most recent first)', () => {
    insertSession(db, { id: 's-old', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['a']), createdAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z' })
    insertSession(db, { id: 's-new', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['b']), createdAt: '2026-01-02T00:00:00.000Z', endedAt: '2026-01-02T00:01:00.000Z' })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s-new')
  })
})
