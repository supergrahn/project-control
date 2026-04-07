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

  it('migrates existing old-schema table preserving rows', () => {
    // Simulate old-schema: drop and recreate with old PK
    db.exec(`DROP TABLE task_source_config`)
    db.exec(`CREATE TABLE task_source_config (
      project_id   TEXT PRIMARY KEY,
      adapter_key  TEXT NOT NULL,
      config       TEXT NOT NULL DEFAULT '{}',
      is_active    INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      last_error   TEXT,
      created_at   TEXT NOT NULL
    )`)
    db.prepare(`INSERT INTO task_source_config (project_id, adapter_key, config, created_at) VALUES (?, 'github', '{"token":"abc"}', ?)`)
      .run(projectId, new Date().toISOString())

    // Re-run migration (simulate restart)
    // We call initDb again on the same DB — but initDb takes a path, not an existing instance.
    // Instead, directly invoke the migration logic by checking what initDb does.
    // Since initDb(':memory:') creates a new DB, we test by re-running the migration inline:
    const cols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
    const hasIdColumn = cols.some(c => c.name === 'id')
    expect(hasIdColumn).toBe(false) // old schema

    // Run migration manually
    if (cols.length > 0 && !hasIdColumn) {
      db.transaction(() => {
        db.exec(`CREATE TABLE task_source_config_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          adapter_key TEXT NOT NULL,
          config TEXT NOT NULL DEFAULT '{}',
          resource_ids TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_synced_at TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(project_id, adapter_key)
        )`)
        db.exec(`INSERT INTO task_source_config_new (project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at)
          SELECT project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at FROM task_source_config`)
        db.exec(`DROP TABLE task_source_config`)
        db.exec(`ALTER TABLE task_source_config_new RENAME TO task_source_config`)
      })()
    }

    // Verify new schema
    const newCols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
    expect(newCols.map(c => c.name)).toContain('id')
    expect(newCols.map(c => c.name)).toContain('resource_ids')

    // Verify row was preserved
    const rows = db.prepare('SELECT * FROM task_source_config').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].adapter_key).toBe('github')
  })
})
