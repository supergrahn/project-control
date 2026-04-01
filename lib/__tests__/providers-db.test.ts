import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

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
