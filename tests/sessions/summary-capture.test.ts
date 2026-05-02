import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { insertSessionEvent } from '@/lib/db/sessionEvents'
import { captureSessionSummary } from '@/lib/sessions/captureSummary'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

let db: Database
let projectId: string
let sessionId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
  sessionId = randomUUID()
  db.prepare(
    `INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, projectId, 'L', 'spec', null, 'ended', new Date().toISOString(), new Date().toISOString())
})

describe('captureSessionSummary', () => {
  it('writes the last non-empty assistant content to sessions.summary', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'user', content: 'hi' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'first response' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'final wrap-up message' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBe('final wrap-up message')
  })

  it('walks back past empty/whitespace-only assistant content', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'real text' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: '' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: '   \n  ' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBe('real text')
  })

  it('leaves summary NULL when no assistant events exist', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'user', content: 'only user input' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBeNull()
  })

  it('does not throw on DB error (try/catch logs and continues)', () => {
    // Pass a closed DB to provoke an error
    db.close()
    expect(() => captureSessionSummary(db, sessionId)).not.toThrow()
  })
})
