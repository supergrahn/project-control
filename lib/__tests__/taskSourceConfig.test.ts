import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getTaskSourceConfig, upsertTaskSourceConfig, deleteTaskSourceConfig, toggleTaskSourceActive, listActiveTaskSources } from '@/lib/db/taskSourceConfig'
import type { Database } from 'better-sqlite3'

let db: Database

beforeEach(() => {
  db = initDb(':memory:')
  // Create a project for FK
  db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Test', '/test', '2024-01-01')").run()
})
afterEach(() => { db.close() })

describe('taskSourceConfig CRUD', () => {
  it('getTaskSourceConfig returns null when none exists', () => {
    const result = getTaskSourceConfig(db, 'p1')
    expect(result).toBeNull()
  })

  it('upsertTaskSourceConfig creates config and getTaskSourceConfig retrieves it with parsed JSON', () => {
    const config = { api_key: 'secret123', base_url: 'https://api.example.com' }
    upsertTaskSourceConfig(db, 'p1', 'github', config)

    const result = getTaskSourceConfig(db, 'p1')
    expect(result).not.toBeNull()
    expect(result?.project_id).toBe('p1')
    expect(result?.adapter_key).toBe('github')
    expect(result?.config).toEqual(config)
    expect(result?.is_active).toBe(1)
  })

  it('upsertTaskSourceConfig updates existing config (ON CONFLICT)', () => {
    const config1 = { api_key: 'old_key' }
    const config2 = { api_key: 'new_key', token: 'xyz' }

    upsertTaskSourceConfig(db, 'p1', 'github', config1)
    upsertTaskSourceConfig(db, 'p1', 'jira', config2)

    const result = getTaskSourceConfig(db, 'p1')
    expect(result).not.toBeNull()
    expect(result?.adapter_key).toBe('jira')
    expect(result?.config).toEqual(config2)
  })

  it('deleteTaskSourceConfig removes the config', () => {
    const config = { api_key: 'secret' }
    upsertTaskSourceConfig(db, 'p1', 'github', config)

    let result = getTaskSourceConfig(db, 'p1')
    expect(result).not.toBeNull()

    deleteTaskSourceConfig(db, 'p1')
    result = getTaskSourceConfig(db, 'p1')
    expect(result).toBeNull()
  })

  it('toggleTaskSourceActive toggles is_active between 0 and 1', () => {
    const config = { api_key: 'secret' }
    upsertTaskSourceConfig(db, 'p1', 'github', config)

    let result = getTaskSourceConfig(db, 'p1')
    expect(result?.is_active).toBe(1)

    toggleTaskSourceActive(db, 'p1', false)
    result = getTaskSourceConfig(db, 'p1')
    expect(result?.is_active).toBe(0)

    toggleTaskSourceActive(db, 'p1', true)
    result = getTaskSourceConfig(db, 'p1')
    expect(result?.is_active).toBe(1)
  })

  it('listActiveTaskSources returns only active configs', () => {
    // Create project p2
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES ('p2', 'Test2', '/test2', '2024-01-01')").run()

    const config1 = { api_key: 'key1' }
    const config2 = { api_key: 'key2' }

    upsertTaskSourceConfig(db, 'p1', 'github', config1)
    upsertTaskSourceConfig(db, 'p2', 'jira', config2)

    // Make p1 inactive
    toggleTaskSourceActive(db, 'p1', false)

    const result = listActiveTaskSources(db)
    expect(result).toHaveLength(1)
    expect(result[0].project_id).toBe('p2')
    expect(result[0].adapter_key).toBe('jira')
  })
})
