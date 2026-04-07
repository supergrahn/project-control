import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import Database from 'better-sqlite3'

let db: Database.Database
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'test', path: '/tmp/test' })
})

afterEach(() => db.close())

describe('task_source_config schema', () => {
  it('has id, project_id, adapter_key, resource_ids columns', () => {
    const cols = db.prepare('PRAGMA table_info(task_source_config)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('adapter_key')
    expect(names).toContain('resource_ids')
  })

  it('allows multiple adapter rows per project', () => {
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO task_source_config (project_id, adapter_key, config, created_at) VALUES (?, ?, '{}', ?)`).run(projectId, 'github', now)
    db.prepare(`INSERT INTO task_source_config (project_id, adapter_key, config, created_at) VALUES (?, ?, '{}', ?)`).run(projectId, 'jira', now)
    const rows = db.prepare('SELECT * FROM task_source_config WHERE project_id = ?').all(projectId)
    expect(rows).toHaveLength(2)
  })

  it('enforces UNIQUE(project_id, adapter_key)', () => {
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO task_source_config (project_id, adapter_key, config, created_at) VALUES (?, ?, '{}', ?)`).run(projectId, 'github', now)
    expect(() => {
      db.prepare(`INSERT INTO task_source_config (project_id, adapter_key, config, created_at) VALUES (?, ?, '{}', ?)`).run(projectId, 'github', now)
    }).toThrow()
  })
})
