import type { Database } from 'better-sqlite3'
import type { TranscriptEvent } from '@/lib/sessions/adapters/types'
import fs from 'fs'
import path from 'path'

export type SessionEventRow = {
  id: number
  session_id: string
  type: string
  role: string | null
  content: string | null
  metadata: string | null
  created_at: string
}

export function insertSessionEvent(db: Database, sessionId: string, event: TranscriptEvent): number {
  const result = db.prepare(
    'INSERT INTO session_events (session_id, type, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId,
    event.type,
    event.role ?? null,
    event.content ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    new Date().toISOString(),
  )
  return result.lastInsertRowid as number
}

export function getSessionEvents(db: Database, sessionId: string): SessionEventRow[] {
  return db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY id ASC').all(sessionId) as SessionEventRow[]
}

export function deleteSessionEvents(db: Database, sessionId: string): void {
  db.prepare('DELETE FROM session_events WHERE session_id = ?').run(sessionId)
}

export function flushSessionEvents(db: Database, sessionId: string, filePath: string): void {
  const events = getSessionEvents(db, sessionId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const ndjson = events.map(e => JSON.stringify({
    type: e.type,
    role: e.role,
    content: e.content,
    metadata: e.metadata ? JSON.parse(e.metadata) : null,
    created_at: e.created_at,
  })).join('\n')
  fs.writeFileSync(filePath, ndjson + '\n', 'utf8')
  deleteSessionEvents(db, sessionId)
}
