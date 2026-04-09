import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, createProject } from '@/lib/db'
import { createTask, getTask } from '@/lib/db/tasks'
import { deleteTaskSourceWithTasks, upsertTaskSourceConfig } from '@/lib/db/taskSourceConfig'

let db: Database.Database
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'test', path: '/tmp/test' })
})

afterEach(() => db.close())

describe('createTask', () => {
  it('creates task with notes in a single atomic operation', () => {
    const task = createTask(db, {
      id: 'task-1',
      projectId,
      title: 'My task',
      notes: 'Some notes here',
    })
    expect(task.notes).toBe('Some notes here')
    // Verify it's persisted correctly
    expect(getTask(db, 'task-1')?.notes).toBe('Some notes here')
  })

  it('creates task without notes when notes is omitted', () => {
    const task = createTask(db, { id: 'task-2', projectId, title: 'No notes' })
    expect(task.notes).toBeNull()
  })
})

describe('deleteTaskSourceWithTasks', () => {
  it('deletes source config and all tasks atomically', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'x' }, [])
    // Insert a task manually linked to this source
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, priority, source, created_at, updated_at)
       VALUES ('t1', ?, 'Task', 'idea', 'medium', 'github', datetime('now'), datetime('now'))`
    ).run(projectId)

    deleteTaskSourceWithTasks(db, projectId, 'github')

    const config = db.prepare('SELECT * FROM task_source_config WHERE project_id = ? AND adapter_key = ?').get(projectId, 'github')
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND source = ?').all(projectId, 'github')
    expect(config).toBeUndefined()
    expect(tasks).toHaveLength(0)
  })
})
