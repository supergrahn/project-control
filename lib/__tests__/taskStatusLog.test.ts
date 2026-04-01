import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { logStatusChange, getTaskStatusLog } from '@/lib/db/taskStatusLog'
import { createTask } from '@/lib/db/tasks'

let db: Database

function insertProject(id: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `P-${id}`, `/tmp/${id}`, new Date().toISOString())
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('logStatusChange', () => {
  it('inserts a status log entry with default changedBy', () => {
    insertProject('p1')
    const task = createTask(db, { id: 't1', projectId: 'p1', title: 'Task 1' })

    logStatusChange(db, task.id, 'idea', 'speccing')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].from_status).toBe('idea')
    expect(logs[0].to_status).toBe('speccing')
    expect(logs[0].changed_by).toBe('user')
    expect(logs[0].reason).toBeNull()
  })

  it('inserts a status log entry with changedBy and reason', () => {
    insertProject('p2')
    const task = createTask(db, { id: 't2', projectId: 'p2', title: 'Task 2' })

    logStatusChange(db, task.id, 'speccing', 'planning', 'sync', 'Synced from external source')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].from_status).toBe('speccing')
    expect(logs[0].to_status).toBe('planning')
    expect(logs[0].changed_by).toBe('sync')
    expect(logs[0].reason).toBe('Synced from external source')
  })

  it('logs multiple transitions for the same task', () => {
    insertProject('p3')
    const task = createTask(db, { id: 't3', projectId: 'p3', title: 'Task 3' })

    logStatusChange(db, task.id, 'idea', 'speccing')
    logStatusChange(db, task.id, 'speccing', 'planning')
    logStatusChange(db, task.id, 'planning', 'developing')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(3)
    const statuses = logs.map(l => l.to_status)
    expect(statuses).toContain('developing')
    expect(statuses).toContain('planning')
    expect(statuses).toContain('speccing')
  })

  it('generates unique ids for log entries', () => {
    insertProject('p4')
    const task = createTask(db, { id: 't4', projectId: 'p4', title: 'Task 4' })

    logStatusChange(db, task.id, 'idea', 'speccing')
    logStatusChange(db, task.id, 'speccing', 'planning')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs[0].id).not.toBe(logs[1].id)
  })
})

describe('getTaskStatusLog', () => {
  it('returns empty array for task with no status changes', () => {
    insertProject('p5')
    const task = createTask(db, { id: 't5', projectId: 'p5', title: 'Task 5' })

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(0)
  })

  it('returns logs ordered by created_at DESC', () => {
    insertProject('p6')
    const task = createTask(db, { id: 't6', projectId: 'p6', title: 'Task 6' })

    logStatusChange(db, task.id, 'idea', 'speccing')
    logStatusChange(db, task.id, 'speccing', 'planning')
    logStatusChange(db, task.id, 'planning', 'developing')

    const logs = getTaskStatusLog(db, task.id)
    // Has all three transitions
    expect(logs).toHaveLength(3)
    const statuses = logs.map(l => l.to_status)
    expect(statuses).toContain('developing')
    expect(statuses).toContain('planning')
    expect(statuses).toContain('speccing')
  })

  it('returns logs for specific task only', () => {
    insertProject('p7')
    const task1 = createTask(db, { id: 't7a', projectId: 'p7', title: 'Task 7a' })
    const task2 = createTask(db, { id: 't7b', projectId: 'p7', title: 'Task 7b' })

    logStatusChange(db, task1.id, 'idea', 'speccing')
    logStatusChange(db, task2.id, 'idea', 'speccing')
    logStatusChange(db, task1.id, 'speccing', 'planning')

    const logs1 = getTaskStatusLog(db, task1.id)
    const logs2 = getTaskStatusLog(db, task2.id)

    expect(logs1).toHaveLength(2)
    expect(logs2).toHaveLength(1)
  })

  it('has timestamps in created_at field', () => {
    insertProject('p8')
    const task = createTask(db, { id: 't8', projectId: 'p8', title: 'Task 8' })

    logStatusChange(db, task.id, 'idea', 'speccing')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs[0].created_at).toBeTruthy()
    expect(new Date(logs[0].created_at).getTime()).toBeGreaterThan(0)
  })

  it('supports different changedBy values', () => {
    insertProject('p9')
    const task = createTask(db, { id: 't9', projectId: 'p9', title: 'Task 9' })

    logStatusChange(db, task.id, 'idea', 'speccing', 'user')
    logStatusChange(db, task.id, 'speccing', 'planning', 'sync')
    logStatusChange(db, task.id, 'planning', 'developing', 'session')

    const logs = getTaskStatusLog(db, task.id)
    // All three changedBy values present
    expect(logs).toHaveLength(3)
    const changedByValues = logs.map(l => l.changed_by)
    expect(changedByValues).toContain('user')
    expect(changedByValues).toContain('sync')
    expect(changedByValues).toContain('session')
  })
})
