import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getTopTasks } from '../topTasks'

function insertProject(db: ReturnType<typeof initDb>, id: string, name = id) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(id, name, `/tmp/${id}`, new Date().toISOString())
}

function insertTask(db: ReturnType<typeof initDb>, opts: {
  id: string; projectId: string; title: string; status?: string; createdAt?: string
}) {
  const now = opts.createdAt ?? new Date().toISOString()
  db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(
    opts.id, opts.projectId, opts.title, opts.status ?? 'idea', now, now,
  )
}

describe('getTopTasks', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1', 'Project One')
  })

  it('returns empty when no tasks', () => {
    expect(getTopTasks(db)).toEqual([])
  })

  it('returns tasks with idea/spec/plan statuses', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Idea task', status: 'idea' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Spec task', status: 'spec' })
    insertTask(db, { id: 't3', projectId: 'p1', title: 'Plan task', status: 'plan' })
    const out = getTopTasks(db)
    expect(out).toHaveLength(3)
  })

  it('excludes done and in-progress tasks', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Done task', status: 'done' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Dev task', status: 'develop' })
    expect(getTopTasks(db)).toEqual([])
  })

  it('orders plan > spec > idea', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Idea task', status: 'idea', createdAt: '2026-05-04T00:00:00.000Z' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Spec task', status: 'spec', createdAt: '2026-05-04T00:00:00.000Z' })
    insertTask(db, { id: 't3', projectId: 'p1', title: 'Plan task', status: 'plan', createdAt: '2026-05-04T00:00:00.000Z' })
    const out = getTopTasks(db)
    expect(out[0].status).toBe('plan')
    expect(out[1].status).toBe('spec')
    expect(out[2].status).toBe('idea')
  })

  it('within same status, orders by created_at DESC', () => {
    insertTask(db, { id: 'old', projectId: 'p1', title: 'Old idea', status: 'idea', createdAt: '2026-05-01T00:00:00.000Z' })
    insertTask(db, { id: 'new', projectId: 'p1', title: 'New idea', status: 'idea', createdAt: '2026-05-04T00:00:00.000Z' })
    const out = getTopTasks(db)
    expect(out[0].taskId).toBe('new')
    expect(out[1].taskId).toBe('old')
  })

  it('includes projectName and title', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'My task' })
    const out = getTopTasks(db)
    expect(out[0].projectName).toBe('Project One')
    expect(out[0].title).toBe('My task')
  })

  it('respects limit option', () => {
    for (let i = 0; i < 15; i++) {
      insertTask(db, { id: `t${i}`, projectId: 'p1', title: `Task ${i}` })
    }
    expect(getTopTasks(db, { limit: 5 })).toHaveLength(5)
  })

  it('does not return deleted tasks if status is not idea/spec/plan', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Review task', status: 'review' })
    expect(getTopTasks(db)).toEqual([])
  })
})
