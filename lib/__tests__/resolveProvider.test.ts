import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createProvider } from '@/lib/db/providers'
import { resolveProvider } from '@/lib/sessions/resolveProvider'

let db: Database

function insertProject(db: Database, id: string, providerId: string | null = null) {
  db.prepare('INSERT INTO projects (id, name, path, created_at, provider_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, `Project ${id}`, `/tmp/${id}`, new Date().toISOString(), providerId)
}

function insertTask(db: Database, id: string, projectId: string, providerId: string | null = null) {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO tasks (id, project_id, title, status, created_at, updated_at, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, `Task ${id}`, 'idea', now, now, providerId)
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('resolveProvider', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers exist', () => {
    insertProject(db, 'proj-empty')
    expect(() => resolveProvider(db, { projectId: 'proj-empty' })).toThrow('NO_PROVIDERS_CONFIGURED')
  })

  it('returns first active provider when no overrides', () => {
    insertProject(db, 'proj-global')
    const p = createProvider(db, { id: 'global-1', name: 'Global', type: 'claude', command: '/bin/claude', config: null })
    expect(resolveProvider(db, { projectId: 'proj-global' }).id).toBe(p.id)
  })

  it('skips inactive providers', () => {
    insertProject(db, 'proj-inactive')
    createProvider(db, { id: 'off-1', name: 'Off', type: 'codex', command: 'codex', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('off-1')
    const active = createProvider(db, { id: 'on-1', name: 'On', type: 'gemini', command: 'gemini', config: null })
    expect(resolveProvider(db, { projectId: 'proj-inactive' }).id).toBe(active.id)
  })

  it('throws when only inactive providers exist', () => {
    insertProject(db, 'proj-all-off')
    createProvider(db, { id: 'x-1', name: 'X', type: 'ollama', command: 'ollama', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('x-1')
    expect(() => resolveProvider(db, { projectId: 'proj-all-off' })).toThrow('NO_PROVIDERS_CONFIGURED')
  })

  it('uses project-level provider_id override', () => {
    const pp = createProvider(db, { id: 'pp-1', name: 'Project', type: 'codex', command: 'codex', config: null })
    createProvider(db, { id: 'g-1', name: 'Global', type: 'claude', command: '/bin/claude', config: null })
    insertProject(db, 'proj-override', pp.id)
    expect(resolveProvider(db, { projectId: 'proj-override' }).id).toBe(pp.id)
  })

  it('uses task-level provider_id over project-level', () => {
    const pp = createProvider(db, { id: 'pp-2', name: 'Project', type: 'codex', command: 'codex', config: null })
    const tp = createProvider(db, { id: 'tp-1', name: 'Task', type: 'gemini', command: 'gemini', config: null })
    insertProject(db, 'proj-task', pp.id)
    insertTask(db, 'task-override', 'proj-task', tp.id)
    expect(resolveProvider(db, { projectId: 'proj-task', taskId: 'task-override' }).id).toBe(tp.id)
  })

  it('falls back to project when task has no provider_id', () => {
    const pp = createProvider(db, { id: 'pp-fb', name: 'ProjFB', type: 'codex', command: 'codex', config: null })
    createProvider(db, { id: 'g-fb', name: 'GlobalFB', type: 'claude', command: '/bin/claude', config: null })
    insertProject(db, 'proj-fb', pp.id)
    insertTask(db, 'task-no-prov', 'proj-fb', null)
    expect(resolveProvider(db, { projectId: 'proj-fb', taskId: 'task-no-prov' }).id).toBe(pp.id)
  })
})
