import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('agents table', () => {
  it('exists with expected columns', () => {
    const cols = db.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('name')
    expect(names).toContain('title')
    expect(names).toContain('provider_id')
    expect(names).toContain('model')
    expect(names).toContain('instructions_path')
    expect(names).toContain('status')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('defaults status to idle', () => {
    const projectId = 'proj-1'
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(projectId, 'Test', '/tmp/test', new Date().toISOString())
    db.prepare('INSERT INTO agents (id, project_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('a-1', projectId, 'CEO', new Date().toISOString(), new Date().toISOString())
    const row = db.prepare('SELECT status FROM agents WHERE id = ?').get('a-1') as { status: string }
    expect(row.status).toBe('idle')
  })
})

describe('sessions.agent_id column', () => {
  it('exists on sessions table', () => {
    const cols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('agent_id')
  })
})
