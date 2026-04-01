import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createTask, updateTask } from '@/lib/db/tasks'
import { createProvider } from '@/lib/db/providers'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('providers table', () => {
  it('exists with all required columns', () => {
    const cols = db.prepare('PRAGMA table_info(providers)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('name')
    expect(names).toContain('type')
    expect(names).toContain('command')
    expect(names).toContain('config')
    expect(names).toContain('is_active')
    expect(names).toContain('created_at')
  })

  it('defaults is_active to 1', () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO providers (id, name, type, command, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('p-1', 'Claude', 'claude', '/home/user/.local/bin/claude', now)
    const row = db.prepare('SELECT is_active FROM providers WHERE id = ?').get('p-1') as { is_active: number }
    expect(row.is_active).toBe(1)
  })
})

describe('projects.provider_id migration', () => {
  it('projects table has provider_id column', () => {
    const cols = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('provider_id')
  })
})

describe('tasks.provider_id migration', () => {
  it('tasks table has provider_id column', () => {
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('provider_id')
  })
})

describe('tasks.provider_id field', () => {
  it('createTask returns provider_id as null by default', () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('tp-proj', 'P', '/tmp/p', new Date().toISOString())
    const task = createTask(db, { id: 'tp-1', projectId: 'tp-proj', title: 'T' })
    expect(task.provider_id).toBeNull()
  })

  it('updateTask can set provider_id', () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('tp-proj2', 'P2', '/tmp/p2', new Date().toISOString())
    createProvider(db, { id: 'tp-prov', name: 'TP', type: 'claude', command: '/bin/claude', config: null })
    const task = createTask(db, { id: 'tp-2', projectId: 'tp-proj2', title: 'T2' })
    const updated = updateTask(db, 'tp-2', { provider_id: 'tp-prov' })
    expect(updated.provider_id).toBe('tp-prov')
  })
})
