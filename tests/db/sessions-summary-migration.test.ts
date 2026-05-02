import { describe, it, expect } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'

describe('migration 64 — sessions.summary column', () => {
  it('adds summary as a nullable TEXT column', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string; type: string; notnull: number }[]
    const summary = cols.find(c => c.name === 'summary')
    expect(summary).toBeDefined()
    expect(summary!.type).toBe('TEXT')
    expect(summary!.notnull).toBe(0)
  })

  it('allows writing and reading summary on an existing session row', () => {
    const db = initDb(':memory:')
    const projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    const sessionId = randomUUID()
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, projectId, 'L', 'spec', null, 'ended', new Date().toISOString(), new Date().toISOString())
    db.prepare(`UPDATE sessions SET summary = ? WHERE id = ?`).run('hello', sessionId)
    const row = db.prepare(`SELECT summary FROM sessions WHERE id = ?`).get(sessionId) as { summary: string }
    expect(row.summary).toBe('hello')
  })

  it('defaults summary to NULL on inserts that don\'t set it', () => {
    const db = initDb(':memory:')
    const projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    const sessionId = randomUUID()
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, projectId, 'L', 'spec', null, 'active', new Date().toISOString(), null)
    const row = db.prepare(`SELECT summary FROM sessions WHERE id = ?`).get(sessionId) as { summary: string | null }
    expect(row.summary).toBeNull()
  })
})
