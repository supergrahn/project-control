import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { initDb } from '@/lib/db'

describe('task_comments table', () => {
  let db: Database

  beforeEach(() => {
    db = initDb(':memory:')
  })
  afterEach(() => { db.close() })

  it('creates task_comments table with correct columns', () => {
    const cols = db.prepare('PRAGMA table_info(task_comments)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('source')
    expect(names).toContain('task_source_id')
    expect(names).toContain('comment_id')
    expect(names).toContain('author')
    expect(names).toContain('body')
    expect(names).toContain('created_at')
    expect(names).toContain('synced_at')
  })

  it('enforces unique(source, task_source_id, comment_id)', () => {
    const now = new Date().toISOString()
    const insert = db.prepare(`
      INSERT INTO task_comments (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('a', 'p1', 'jira', 'TASK-1', 'c1', 'alice', 'hello', now, now)
    expect(() =>
      insert.run('b', 'p1', 'jira', 'TASK-1', 'c1', 'alice', 'dup', now, now)
    ).toThrow()
  })
})
