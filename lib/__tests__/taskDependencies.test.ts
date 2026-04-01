import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { addDependency, removeDependency, getTaskDependencies, isTaskBlocked } from '@/lib/db/taskDependencies'
import { createTask, updateTask } from '@/lib/db/tasks'

let db: Database

function insertProject(id: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `P-${id}`, `/tmp/${id}`, new Date().toISOString())
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('addDependency', () => {
  it('adds a dependency between two tasks', () => {
    insertProject('p1')
    const task1 = createTask(db, { id: 't1', projectId: 'p1', title: 'Task 1' })
    const task2 = createTask(db, { id: 't2', projectId: 'p1', title: 'Task 2' })

    addDependency(db, task1.id, task2.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps).toHaveLength(1)
    expect(deps[0].task_id).toBe(task1.id)
    expect(deps[0].depends_on_id).toBe(task2.id)
  })

  it('ignores duplicate dependencies', () => {
    insertProject('p2')
    const task1 = createTask(db, { id: 't3', projectId: 'p2', title: 'Task 3' })
    const task2 = createTask(db, { id: 't4', projectId: 'p2', title: 'Task 4' })

    addDependency(db, task1.id, task2.id)
    addDependency(db, task1.id, task2.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps).toHaveLength(1)
  })

  it('allows multiple dependencies from one task', () => {
    insertProject('p3')
    const task1 = createTask(db, { id: 't5', projectId: 'p3', title: 'Task 5' })
    const task2 = createTask(db, { id: 't6', projectId: 'p3', title: 'Task 6' })
    const task3 = createTask(db, { id: 't7', projectId: 'p3', title: 'Task 7' })

    addDependency(db, task1.id, task2.id)
    addDependency(db, task1.id, task3.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps).toHaveLength(2)
  })
})

describe('removeDependency', () => {
  it('removes a dependency', () => {
    insertProject('p4')
    const task1 = createTask(db, { id: 't8', projectId: 'p4', title: 'Task 8' })
    const task2 = createTask(db, { id: 't9', projectId: 'p4', title: 'Task 9' })

    addDependency(db, task1.id, task2.id)
    removeDependency(db, task1.id, task2.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps).toHaveLength(0)
  })

  it('only removes specified dependency', () => {
    insertProject('p5')
    const task1 = createTask(db, { id: 't10', projectId: 'p5', title: 'Task 10' })
    const task2 = createTask(db, { id: 't11', projectId: 'p5', title: 'Task 11' })
    const task3 = createTask(db, { id: 't12', projectId: 'p5', title: 'Task 12' })

    addDependency(db, task1.id, task2.id)
    addDependency(db, task1.id, task3.id)
    removeDependency(db, task1.id, task2.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps).toHaveLength(1)
    expect(deps[0].depends_on_id).toBe(task3.id)
  })
})

describe('getTaskDependencies', () => {
  it('returns incoming dependencies (tasks this task depends on)', () => {
    insertProject('p6')
    const task1 = createTask(db, { id: 't13', projectId: 'p6', title: 'Task 13' })
    const task2 = createTask(db, { id: 't14', projectId: 'p6', title: 'Task 14' })

    addDependency(db, task1.id, task2.id)

    const incomingDeps = getTaskDependencies(db, task1.id, 'incoming')
    expect(incomingDeps).toHaveLength(1)
    expect(incomingDeps[0].depends_on_id).toBe(task2.id)
  })

  it('returns outgoing dependencies (tasks that depend on this task)', () => {
    insertProject('p7')
    const task1 = createTask(db, { id: 't15', projectId: 'p7', title: 'Task 15' })
    const task2 = createTask(db, { id: 't16', projectId: 'p7', title: 'Task 16' })

    addDependency(db, task2.id, task1.id)

    const outgoingDeps = getTaskDependencies(db, task1.id, 'outgoing')
    expect(outgoingDeps).toHaveLength(1)
    expect(outgoingDeps[0].task_id).toBe(task2.id)
  })

  it('returns dependencies ordered by created_at DESC', () => {
    insertProject('p8')
    const task1 = createTask(db, { id: 't17', projectId: 'p8', title: 'Task 17' })
    const task2 = createTask(db, { id: 't18', projectId: 'p8', title: 'Task 18' })
    const task3 = createTask(db, { id: 't19', projectId: 'p8', title: 'Task 19' })

    addDependency(db, task1.id, task2.id)
    const before = new Date().getTime()
    while (new Date().getTime() - before < 2) {}
    addDependency(db, task1.id, task3.id)

    const deps = getTaskDependencies(db, task1.id, 'incoming')
    expect(deps[0].depends_on_id).toBe(task3.id)
    expect(deps[1].depends_on_id).toBe(task2.id)
  })
})

describe('isTaskBlocked', () => {
  it('returns false for task with no dependencies', () => {
    insertProject('p9')
    const task = createTask(db, { id: 't20', projectId: 'p9', title: 'Task 20' })

    expect(isTaskBlocked(db, task.id)).toBe(false)
  })

  it('returns false when all dependencies are done', () => {
    insertProject('p10')
    const task1 = createTask(db, { id: 't21', projectId: 'p10', title: 'Task 21' })
    const task2 = createTask(db, { id: 't22', projectId: 'p10', title: 'Task 22', priority: 'high' })

    // Update task2 to done
    updateTask(db, task2.id, { status: 'done' })

    addDependency(db, task1.id, task2.id)
    expect(isTaskBlocked(db, task1.id)).toBe(false)
  })

  it('returns true when there are unfinished dependencies', () => {
    insertProject('p11')
    const task1 = createTask(db, { id: 't23', projectId: 'p11', title: 'Task 23' })
    const task2 = createTask(db, { id: 't24', projectId: 'p11', title: 'Task 24' })

    addDependency(db, task1.id, task2.id)
    expect(isTaskBlocked(db, task1.id)).toBe(true)
  })

  it('handles multiple dependencies correctly', () => {
    insertProject('p12')
    const task1 = createTask(db, { id: 't25', projectId: 'p12', title: 'Task 25' })
    const task2 = createTask(db, { id: 't26', projectId: 'p12', title: 'Task 26' })
    const task3 = createTask(db, { id: 't27', projectId: 'p12', title: 'Task 27' })

    // Both dependencies are unfinished
    addDependency(db, task1.id, task2.id)
    addDependency(db, task1.id, task3.id)
    expect(isTaskBlocked(db, task1.id)).toBe(true)

    // Mark one as done
    updateTask(db, task2.id, { status: 'done' })
    expect(isTaskBlocked(db, task1.id)).toBe(true)

    // Mark both as done
    updateTask(db, task3.id, { status: 'done' })
    expect(isTaskBlocked(db, task1.id)).toBe(false)
  })
})
