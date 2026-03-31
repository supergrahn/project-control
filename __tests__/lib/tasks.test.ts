import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

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
