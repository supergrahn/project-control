import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type EventSeverity = 'info' | 'warn' | 'error'

export type AppEvent = {
  id: string
  projectId: string | null
  type: string
  summary: string
  detail: string | null
  severity: EventSeverity
  createdAt: string
}

export function logEvent(db: Database.Database, data: {
  projectId?: string | null
  type: string
  summary: string
  detail?: string
  severity: EventSeverity
}): void {
  db.prepare(`INSERT INTO events (id, project_id, type, summary, detail, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), data.projectId ?? null, data.type, data.summary, data.detail ?? null, data.severity, new Date().toISOString())
}

export function getRecentEvents(db: Database.Database, limit: number, projectId?: string): AppEvent[] {
  if (projectId) {
    return db.prepare(`SELECT id, project_id as projectId, type, summary, detail, severity, created_at as createdAt FROM events WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`)
      .all(projectId, limit) as AppEvent[]
  }
  return db.prepare(`SELECT id, project_id as projectId, type, summary, detail, severity, created_at as createdAt FROM events ORDER BY created_at DESC, rowid DESC LIMIT ?`)
    .all(limit) as AppEvent[]
}
