import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createTask, updateTask, transitionTaskStatus, getTask } from '@/lib/db/tasks'
import { getTaskStatusLog } from '@/lib/db/taskStatusLog'
import { getTasksByProject } from '@/lib/db/tasks'

let db: Database

function insertProject(id: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `P-${id}`, `/tmp/${id}`, new Date().toISOString())
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('transitionTaskStatus', () => {
  it('transitions task status and returns updated task', () => {
    insertProject('p1')
    const task = createTask(db, { id: 't1', projectId: 'p1', title: 'Task 1' })

    const result = transitionTaskStatus(db, task.id, 'speccing')
    expect(result.task.status).toBe('speccing')
    expect(result.warnings).toHaveLength(0)

    const updated = getTask(db, task.id)
    expect(updated?.status).toBe('speccing')
  })

  it('logs status change with default changedBy', () => {
    insertProject('p2')
    const task = createTask(db, { id: 't2', projectId: 'p2', title: 'Task 2' })

    transitionTaskStatus(db, task.id, 'speccing')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].from_status).toBe('idea')
    expect(logs[0].to_status).toBe('speccing')
    expect(logs[0].changed_by).toBe('user')
  })

  it('logs status change with reason', () => {
    insertProject('p3')
    const task = createTask(db, { id: 't3', projectId: 'p3', title: 'Task 3' })

    transitionTaskStatus(db, task.id, 'speccing', 'User initiated transition')

    const logs = getTaskStatusLog(db, task.id)
    expect(logs[0].reason).toBe('User initiated transition')
  })

  it('throws error for invalid transitions', () => {
    insertProject('p4')
    const task = createTask(db, { id: 't4', projectId: 'p4', title: 'Task 4' })

    expect(() => {
      transitionTaskStatus(db, task.id, 'planning')
    }).toThrow('Invalid transition')
  })

  it('throws error for non-existent task', () => {
    expect(() => {
      transitionTaskStatus(db, 'nonexistent', 'speccing')
    }).toThrow('not found')
  })

  it('returns warnings for missing spec_file before planning', () => {
    insertProject('p5')
    const task = createTask(db, { id: 't5', projectId: 'p5', title: 'Task 5' })
    updateTask(db, task.id, { status: 'speccing' })

    const result = transitionTaskStatus(db, task.id, 'planning')
    expect(result.warnings.some(w => w.includes('Spec file'))).toBe(true)
  })

  it('returns no warnings when spec_file is set before planning', () => {
    insertProject('p6')
    const task = createTask(db, { id: 't6', projectId: 'p6', title: 'Task 6' })
    updateTask(db, task.id, { status: 'speccing', spec_file: 'file://spec.md' })

    const result = transitionTaskStatus(db, task.id, 'planning')
    expect(result.warnings.filter(w => w.includes('Spec file'))).toHaveLength(0)
  })

  it('updates task updated_at timestamp', () => {
    insertProject('p7')
    const task = createTask(db, { id: 't7', projectId: 'p7', title: 'Task 7' })
    const originalUpdatedAt = task.updated_at

    const before = new Date().getTime()
    while (new Date().getTime() - before < 2) {}

    transitionTaskStatus(db, task.id, 'speccing')
    const updated = getTask(db, task.id)

    expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime()
    )
  })

  it('allows backward transitions', () => {
    insertProject('p8')
    const task = createTask(db, { id: 't8', projectId: 'p8', title: 'Task 8' })
    updateTask(db, task.id, { status: 'planning' })

    const result = transitionTaskStatus(db, task.id, 'speccing')
    expect(result.task.status).toBe('speccing')
  })

  it('allows jump to done from any status', () => {
    insertProject('p9')
    const task = createTask(db, { id: 't9', projectId: 'p9', title: 'Task 9' })

    const result = transitionTaskStatus(db, task.id, 'done')
    expect(result.task.status).toBe('done')
  })
})

describe('updateTask with status changes', () => {
  it('logs status change when status is updated via updateTask', () => {
    insertProject('p10')
    const task = createTask(db, { id: 't10', projectId: 'p10', title: 'Task 10' })

    updateTask(db, task.id, { status: 'speccing' })

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].changed_by).toBe('sync')
  })

  it('does not log if status does not change', () => {
    insertProject('p11')
    const task = createTask(db, { id: 't11', projectId: 'p11', title: 'Task 11' })

    updateTask(db, task.id, { title: 'Updated Title' })

    const logs = getTaskStatusLog(db, task.id)
    expect(logs).toHaveLength(0)
  })
})

describe('getTasksByProject priority ordering', () => {
  it('orders tasks by priority then updated_at', () => {
    insertProject('p12')
    const urgentTask = createTask(db, {
      id: 't12a',
      projectId: 'p12',
      title: 'Urgent Task',
      priority: 'urgent'
    })
    const highTask = createTask(db, {
      id: 't12b',
      projectId: 'p12',
      title: 'High Task',
      priority: 'high'
    })
    const mediumTask = createTask(db, {
      id: 't12c',
      projectId: 'p12',
      title: 'Medium Task',
      priority: 'medium'
    })
    const lowTask = createTask(db, {
      id: 't12d',
      projectId: 'p12',
      title: 'Low Task',
      priority: 'low'
    })

    const tasks = getTasksByProject(db, 'p12')
    expect(tasks[0].priority).toBe('urgent')
    expect(tasks[1].priority).toBe('high')
    expect(tasks[2].priority).toBe('medium')
    expect(tasks[3].priority).toBe('low')
  })

  it('orders by priority within each status', () => {
    insertProject('p13')
    const urgentSpec = createTask(db, {
      id: 't13a',
      projectId: 'p13',
      title: 'Urgent Spec',
      priority: 'urgent'
    })
    const mediumSpec = createTask(db, {
      id: 't13b',
      projectId: 'p13',
      title: 'Medium Spec',
      priority: 'medium'
    })

    updateTask(db, urgentSpec.id, { status: 'speccing' })
    updateTask(db, mediumSpec.id, { status: 'speccing' })

    const tasks = getTasksByProject(db, 'p13', 'speccing')
    expect(tasks[0].id).toBe(urgentSpec.id)
    expect(tasks[1].id).toBe(mediumSpec.id)
  })

  it('orders by updated_at within same priority', () => {
    insertProject('p14')
    const task1 = createTask(db, {
      id: 't14a',
      projectId: 'p14',
      title: 'Task 1',
      priority: 'high'
    })

    const before = new Date().getTime()
    while (new Date().getTime() - before < 2) {}

    const task2 = createTask(db, {
      id: 't14b',
      projectId: 'p14',
      title: 'Task 2',
      priority: 'high'
    })

    const tasks = getTasksByProject(db, 'p14')
    // Most recent first
    expect(tasks[0].id).toBe(task2.id)
    expect(tasks[1].id).toBe(task1.id)
  })

  it('handles mixed priorities and statuses', () => {
    insertProject('p15')
    createTask(db, { id: 't15a', projectId: 'p15', title: 'Low Idea', priority: 'low' })
    createTask(db, {
      id: 't15b',
      projectId: 'p15',
      title: 'High Idea',
      priority: 'high'
    })
    createTask(db, {
      id: 't15c',
      projectId: 'p15',
      title: 'Urgent Idea',
      priority: 'urgent'
    })

    const tasks = getTasksByProject(db, 'p15', 'idea')
    expect(tasks.map(t => t.priority)).toEqual(['urgent', 'high', 'low'])
  })
})
