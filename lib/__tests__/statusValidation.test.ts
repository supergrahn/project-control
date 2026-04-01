import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { isValidTransition, isBackwardTransition, checkReadiness, VALID_TRANSITIONS } from '@/lib/db/statusValidation'
import { createTask, updateTask, getTask } from '@/lib/db/tasks'
import { addDependency } from '@/lib/db/taskDependencies'

let db: Database

function insertProject(id: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `P-${id}`, `/tmp/${id}`, new Date().toISOString())
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('VALID_TRANSITIONS', () => {
  it('defines valid transitions for all statuses', () => {
    expect(VALID_TRANSITIONS.idea).toEqual(['speccing', 'done'])
    expect(VALID_TRANSITIONS.speccing).toEqual(['planning', 'idea', 'done'])
    expect(VALID_TRANSITIONS.planning).toEqual(['developing', 'speccing', 'done'])
    expect(VALID_TRANSITIONS.developing).toEqual(['done', 'planning'])
    expect(VALID_TRANSITIONS.done).toEqual(['developing'])
  })
})

describe('isValidTransition', () => {
  it('allows forward transitions', () => {
    expect(isValidTransition('idea', 'speccing')).toBe(true)
    expect(isValidTransition('speccing', 'planning')).toBe(true)
    expect(isValidTransition('planning', 'developing')).toBe(true)
    expect(isValidTransition('developing', 'done')).toBe(true)
  })

  it('allows backward transitions', () => {
    expect(isValidTransition('speccing', 'idea')).toBe(true)
    expect(isValidTransition('planning', 'speccing')).toBe(true)
    expect(isValidTransition('developing', 'planning')).toBe(true)
    expect(isValidTransition('done', 'developing')).toBe(true)
  })

  it('allows jump to done from any status', () => {
    expect(isValidTransition('idea', 'done')).toBe(true)
    expect(isValidTransition('speccing', 'done')).toBe(true)
    expect(isValidTransition('planning', 'done')).toBe(true)
    expect(isValidTransition('developing', 'done')).toBe(true)
  })

  it('rejects invalid skips (forward-only without jump-to-done path)', () => {
    // These are forward skips that don't go through planning
    expect(isValidTransition('idea', 'planning')).toBe(false)
    expect(isValidTransition('idea', 'developing')).toBe(false)
    // Speccing can't skip to developing
    expect(isValidTransition('speccing', 'developing')).toBe(false)
  })

  it('rejects same status transition', () => {
    expect(isValidTransition('idea', 'idea')).toBe(false)
    expect(isValidTransition('done', 'done')).toBe(false)
  })

  it('rejects invalid backward transitions', () => {
    expect(isValidTransition('idea', 'speccing')).toBe(true)
    expect(isValidTransition('idea', 'idea')).toBe(false)
    expect(isValidTransition('speccing', 'speccing')).toBe(false)
  })
})

describe('isBackwardTransition', () => {
  it('identifies backward transitions', () => {
    expect(isBackwardTransition('speccing', 'idea')).toBe(true)
    expect(isBackwardTransition('planning', 'speccing')).toBe(true)
    expect(isBackwardTransition('developing', 'planning')).toBe(true)
    expect(isBackwardTransition('done', 'developing')).toBe(true)
  })

  it('identifies forward transitions as not backward', () => {
    expect(isBackwardTransition('idea', 'speccing')).toBe(false)
    expect(isBackwardTransition('speccing', 'planning')).toBe(false)
    expect(isBackwardTransition('planning', 'developing')).toBe(false)
    expect(isBackwardTransition('developing', 'done')).toBe(false)
  })

  it('identifies jump transitions as forward', () => {
    expect(isBackwardTransition('idea', 'done')).toBe(false)
    expect(isBackwardTransition('planning', 'done')).toBe(false)
  })
})

describe('checkReadiness', () => {
  it('returns empty warnings for transitions with all prerequisites met', () => {
    insertProject('p1')
    const task = createTask(db, { id: 't1', projectId: 'p1', title: 'Task 1' })
    updateTask(db, task.id, { spec_file: 'file://spec.md', plan_file: 'file://plan.md' })
    // Need to fetch the updated task
    const { getTask } = require('@/lib/db/tasks')
    const updatedTask = getTask(db, task.id)

    const warnings = checkReadiness(db, updatedTask!, 'planning')
    expect(warnings).not.toContainEqual(expect.stringContaining('Spec file'))
  })

  it('warns when spec_file is not set before planning', () => {
    insertProject('p2')
    const task = createTask(db, { id: 't2', projectId: 'p2', title: 'Task 2' })

    const warnings = checkReadiness(db, task, 'planning')
    expect(warnings).toContainEqual(expect.stringContaining('Spec file'))
  })

  it('does not warn when spec_file is set before planning', () => {
    insertProject('p3')
    const task = createTask(db, { id: 't3', projectId: 'p3', title: 'Task 3' })
    updateTask(db, task.id, { spec_file: 'file://spec.md' })

    const warnings = checkReadiness(db, task, 'planning')
    expect(warnings).not.toContainEqual(expect.stringContaining('Spec file'))
  })

  it('warns when plan_file is not set before developing', () => {
    insertProject('p4')
    const task = createTask(db, { id: 't4', projectId: 'p4', title: 'Task 4' })

    const warnings = checkReadiness(db, task, 'developing')
    expect(warnings).toContainEqual(expect.stringContaining('Plan file'))
  })

  it('does not warn when plan_file is set before developing', () => {
    insertProject('p5')
    const task = createTask(db, { id: 't5', projectId: 'p5', title: 'Task 5' })
    updateTask(db, task.id, { plan_file: 'file://plan.md' })

    const warnings = checkReadiness(db, task, 'developing')
    expect(warnings).not.toContainEqual(expect.stringContaining('Plan file'))
  })

  it('allows transitions to speccing without spec_file', () => {
    insertProject('p6')
    const task = createTask(db, { id: 't6', projectId: 'p6', title: 'Task 6' })

    const warnings = checkReadiness(db, task, 'speccing')
    expect(warnings.filter(w => w.includes('Spec file'))).toHaveLength(0)
  })

  it('allows transitions to done without warnings', () => {
    insertProject('p7')
    const task = createTask(db, { id: 't7', projectId: 'p7', title: 'Task 7' })

    const warnings = checkReadiness(db, task, 'done')
    expect(warnings).toHaveLength(0)
  })

  it('allows backward transitions without file warnings', () => {
    insertProject('p8')
    const task = createTask(db, { id: 't8', projectId: 'p8', title: 'Task 8' })
    updateTask(db, task.id, { status: 'developing' })

    const warnings = checkReadiness(db, task, 'planning')
    expect(warnings.filter(w => w.includes('file'))).toHaveLength(0)
  })

  it('warns when task has unfinished dependencies', () => {
    insertProject('p9')
    const blocker = createTask(db, { id: 't9a', projectId: 'p9', title: 'Blocker' })
    const blocked = createTask(db, { id: 't9b', projectId: 'p9', title: 'Blocked' })

    addDependency(db, blocked.id, blocker.id)

    const warnings = checkReadiness(db, blocked, 'planning')
    expect(warnings).toContainEqual(expect.stringContaining('unfinished'))
    expect(warnings).toContainEqual(expect.stringContaining('dependency'))
  })

  it('does not warn when all dependencies are done', () => {
    insertProject('p10')
    const blocker = createTask(db, { id: 't10a', projectId: 'p10', title: 'Blocker' })
    const blocked = createTask(db, { id: 't10b', projectId: 'p10', title: 'Blocked' })

    addDependency(db, blocked.id, blocker.id)
    updateTask(db, blocker.id, { status: 'done' })

    const warnings = checkReadiness(db, blocked, 'planning')
    expect(warnings.filter(w => w.includes('dependency') || w.includes('dependencies'))).toHaveLength(0)
  })

  it('handles multiple warnings', () => {
    insertProject('p11')
    const blocker = createTask(db, { id: 't11a', projectId: 'p11', title: 'Blocker' })
    const blocked = createTask(db, { id: 't11b', projectId: 'p11', title: 'Blocked' })

    addDependency(db, blocked.id, blocker.id)

    const warnings = checkReadiness(db, blocked, 'planning')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes('Spec file'))).toBe(true)
    expect(warnings.some(w => w.includes('dependency') || w.includes('dependencies'))).toBe(true)
  })
})
