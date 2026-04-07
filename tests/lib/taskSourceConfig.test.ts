import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, createProject, runTaskSourceMigration } from '@/lib/db'
import Database from 'better-sqlite3'
import {
  upsertTaskSourceConfig,
  getTaskSourceConfig,
  listTaskSourceConfigs,
  deleteTaskSourceConfig,
  toggleTaskSourceActive,
  listActiveTaskSources,
} from '@/lib/db/taskSourceConfig'

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

    // Verify old schema (no id column)
    const oldCols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
    expect(oldCols.map(c => c.name)).not.toContain('id')

    // Run the actual migration function
    runTaskSourceMigration(db)

    const newCols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
    expect(newCols.map(c => c.name)).toContain('id')
    expect(newCols.map(c => c.name)).toContain('resource_ids')

    const rows = db.prepare('SELECT * FROM task_source_config').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].adapter_key).toBe('github')
  })
})

describe('taskSourceConfig CRUD', () => {
  it('upserts and retrieves a config', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo1'])
    const cfg = getTaskSourceConfig(db, projectId, 'github')
    expect(cfg?.config.token).toBe('abc')
    expect(cfg?.resource_ids).toEqual(['owner/repo1'])
  })

  it('upsert updates existing config without creating duplicate', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'v1' }, [])
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'v2' }, ['r1'])
    const configs = listTaskSourceConfigs(db, projectId)
    expect(configs).toHaveLength(1)
    expect(configs[0].config.token).toBe('v2')
    expect(configs[0].resource_ids).toEqual(['r1'])
  })

  it('lists multiple adapter configs per project', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'https://x.atlassian.net', email: 'a@b.com', api_token: 'tok' }, [])
    const configs = listTaskSourceConfigs(db, projectId)
    expect(configs).toHaveLength(2)
    const keys = configs.map(c => c.adapter_key)
    expect(keys).toContain('github')
    expect(keys).toContain('jira')
  })

  it('deletes a specific adapter config', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])
    deleteTaskSourceConfig(db, projectId, 'github')
    const configs = listTaskSourceConfigs(db, projectId)
    expect(configs).toHaveLength(1)
    expect(configs[0].adapter_key).toBe('jira')
  })

  it('toggles active state for specific adapter', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    toggleTaskSourceActive(db, projectId, 'github', false)
    const cfg = getTaskSourceConfig(db, projectId, 'github')
    expect(cfg?.is_active).toBe(false)
  })

  it('listActiveTaskSources returns only active rows', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])
    toggleTaskSourceActive(db, projectId, 'jira', false)
    const active = listActiveTaskSources(db)
    expect(active).toHaveLength(1)
    expect(active[0].adapter_key).toBe('github')
  })

  it('resource_ids defaults to empty array when null in DB', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    const cfg = getTaskSourceConfig(db, projectId, 'github')
    expect(cfg?.resource_ids).toEqual([])
  })
})
