import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createTask, getTask, getTasksByProject, updateTask, advanceTaskStatus } from '@/lib/db/tasks'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('tasks table', () => {
  it('exists with expected columns', () => {
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('title')
    expect(names).toContain('status')
    expect(names).toContain('idea_file')
    expect(names).toContain('spec_file')
    expect(names).toContain('plan_file')
    expect(names).toContain('dev_summary')
    expect(names).toContain('commit_refs')
    expect(names).toContain('doc_refs')
    expect(names).toContain('notes')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('defaults status to idea', () => {
    const projectId = 'proj-1'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(projectId, 'Test', '/tmp/test', new Date().toISOString())
    db.prepare("INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run('t-1', projectId, 'My task', new Date().toISOString(), new Date().toISOString())
    const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get('t-1') as { status: string }
    expect(row.status).toBe('idea')
  })
})

describe('sessions.task_id', () => {
  it('has task_id column', () => {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('task_id')
  })
})

describe('createTask', () => {
  it('creates a task with status idea', () => {
    const projectId = 'proj-crud'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(projectId, 'Test', '/tmp/test', new Date().toISOString())
    const task = createTask(db, { id: 'task-1', projectId, title: 'Auth redesign' })
    expect(task.id).toBe('task-1')
    expect(task.status).toBe('idea')
    expect(task.title).toBe('Auth redesign')
    expect(task.idea_file).toBeNull()
  })
})

describe('getTask', () => {
  it('returns undefined for unknown id', () => {
    expect(getTask(db, 'nonexistent')).toBeUndefined()
  })
})

describe('getTasksByProject', () => {
  it('returns tasks filtered by project', () => {
    const pid = 'proj-filter'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/p', new Date().toISOString())
    createTask(db, { id: 'ta', projectId: pid, title: 'A' })
    createTask(db, { id: 'tb', projectId: pid, title: 'B' })
    const tasks = getTasksByProject(db, pid)
    expect(tasks).toHaveLength(2)
  })

  it('filters by status when provided', () => {
    const pid = 'proj-status'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/ps', new Date().toISOString())
    createTask(db, { id: 'tc', projectId: pid, title: 'C' })
    createTask(db, { id: 'td', projectId: pid, title: 'D' })
    advanceTaskStatus(db, 'td', 'speccing')
    const ideas = getTasksByProject(db, pid, 'idea')
    expect(ideas).toHaveLength(1)
    expect(ideas[0].id).toBe('tc')
  })
})

describe('updateTask', () => {
  it('updates artifact file refs', () => {
    const pid = 'proj-update'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pu', new Date().toISOString())
    createTask(db, { id: 'te', projectId: pid, title: 'E' })
    const updated = updateTask(db, 'te', { idea_file: '/tmp/idea.md' })
    expect(updated.idea_file).toBe('/tmp/idea.md')
  })

  it('updates notes', () => {
    const pid = 'proj-notes'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pn', new Date().toISOString())
    createTask(db, { id: 'tf', projectId: pid, title: 'F' })
    const updated = updateTask(db, 'tf', { notes: 'Watch out for X' })
    expect(updated.notes).toBe('Watch out for X')
  })
})

describe('advanceTaskStatus', () => {
  it('advances status forward', () => {
    const pid = 'proj-advance'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pa', new Date().toISOString())
    createTask(db, { id: 'tg', projectId: pid, title: 'G' })
    const advanced = advanceTaskStatus(db, 'tg', 'speccing')
    expect(advanced.status).toBe('speccing')
  })

  it('does not go backwards', () => {
    const pid = 'proj-back'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pb', new Date().toISOString())
    createTask(db, { id: 'th', projectId: pid, title: 'H' })
    advanceTaskStatus(db, 'th', 'planning')
    const unchanged = advanceTaskStatus(db, 'th', 'idea')
    expect(unchanged.status).toBe('planning')
  })
})
