import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('skills table', () => {
  it('exists with expected columns', () => {
    const cols = db.prepare('PRAGMA table_info(skills)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('name')
    expect(names).toContain('key')
    expect(names).toContain('file_path')
    expect(names).toContain('created_at')
  })

  it('enforces UNIQUE(project_id, key)', () => {
    const pid = 'proj-1'
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run(pid, 'Test', '/tmp/test', new Date().toISOString())
    const now = new Date().toISOString()
    db.prepare('INSERT INTO skills (id, project_id, name, key, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('s1', pid, 'Coding Standards', 'coding-standards', '.skills/coding-standards.md', now)
    expect(() => {
      db.prepare('INSERT INTO skills (id, project_id, name, key, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run('s2', pid, 'Coding Standards 2', 'coding-standards', '.skills/coding-standards2.md', now)
    }).toThrow()
  })
})
