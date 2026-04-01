import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createAgent, getAgent, getAgentsByProject, updateAgent, deleteAgent } from '@/lib/db/agents'

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

const PROJECT_ID = 'proj-crud'

function seedProject(db: Database) {
  db.prepare('INSERT OR IGNORE INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(PROJECT_ID, 'Test', '/tmp/test', new Date().toISOString())
}

describe('createAgent', () => {
  it('creates an agent with idle status', () => {
    seedProject(db)
    const agent = createAgent(db, { id: 'ag-1', projectId: PROJECT_ID, name: 'CEO', instructionsPath: '.agents/ceo' })
    expect(agent.id).toBe('ag-1')
    expect(agent.name).toBe('CEO')
    expect(agent.status).toBe('idle')
    expect(agent.project_id).toBe(PROJECT_ID)
  })
})

describe('getAgent', () => {
  it('returns the agent by id', () => {
    seedProject(db)
    createAgent(db, { id: 'ag-2', projectId: PROJECT_ID, name: 'Dev', instructionsPath: '.agents/dev' })
    const agent = getAgent(db, 'ag-2')
    expect(agent?.name).toBe('Dev')
  })

  it('returns undefined for unknown id', () => {
    expect(getAgent(db, 'nonexistent')).toBeUndefined()
  })
})

describe('getAgentsByProject', () => {
  it('returns all agents for a project', () => {
    seedProject(db)
    createAgent(db, { id: 'ag-3', projectId: PROJECT_ID, name: 'A', instructionsPath: '.agents/a' })
    createAgent(db, { id: 'ag-4', projectId: PROJECT_ID, name: 'B', instructionsPath: '.agents/b' })
    const agents = getAgentsByProject(db, PROJECT_ID)
    expect(agents).toHaveLength(2)
  })

  it('returns empty array when no agents', () => {
    seedProject(db)
    expect(getAgentsByProject(db, PROJECT_ID)).toHaveLength(0)
  })
})

describe('updateAgent', () => {
  it('updates name and title', () => {
    seedProject(db)
    createAgent(db, { id: 'ag-5', projectId: PROJECT_ID, name: 'Old', instructionsPath: '.agents/old' })
    const updated = updateAgent(db, 'ag-5', { name: 'New', title: 'Principal Dev' })
    expect(updated.name).toBe('New')
    expect(updated.title).toBe('Principal Dev')
  })

  it('updates status', () => {
    seedProject(db)
    createAgent(db, { id: 'ag-6', projectId: PROJECT_ID, name: 'Bot', instructionsPath: '.agents/bot' })
    const updated = updateAgent(db, 'ag-6', { status: 'running' })
    expect(updated.status).toBe('running')
  })
})

describe('deleteAgent', () => {
  it('removes the agent record', () => {
    seedProject(db)
    createAgent(db, { id: 'ag-7', projectId: PROJECT_ID, name: 'Temp', instructionsPath: '.agents/temp' })
    deleteAgent(db, 'ag-7')
    expect(getAgent(db, 'ag-7')).toBeUndefined()
  })
})
