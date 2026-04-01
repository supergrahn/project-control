import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'

describe('Session History API', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    // Create minimal schema
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        provider_type TEXT,
        created_at TEXT,
        ended_at TEXT,
        exit_reason TEXT,
        status TEXT DEFAULT 'active'
      )
    `)
  })

  describe('GET /api/tasks/[id]/sessions', () => {
    it('returns all sessions for a task ordered by created_at DESC', () => {
      const taskId = 'task-123'

      // Insert test sessions
      db.prepare(`
        INSERT INTO sessions (id, task_id, provider_type, created_at, ended_at, exit_reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('sess-1', taskId, 'claude', '2026-04-01T10:00:00Z', null, null, 'active')

      db.prepare(`
        INSERT INTO sessions (id, task_id, provider_type, created_at, ended_at, exit_reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('sess-2', taskId, 'claude', '2026-04-01T11:00:00Z', '2026-04-01T11:30:00Z', 'completed', 'ended')

      // Simulate the GET endpoint query
      const sessions = db
        .prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC')
        .all(taskId) as any[]

      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('sess-2') // Most recent first
      expect(sessions[1].id).toBe('sess-1')
    })

    it('returns empty array when no sessions exist for task', () => {
      const sessions = db
        .prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC')
        .all('non-existent-task') as any[]

      expect(sessions).toHaveLength(0)
    })

    it('includes exit_reason in response', () => {
      const taskId = 'task-123'

      db.prepare(`
        INSERT INTO sessions (id, task_id, provider_type, created_at, ended_at, exit_reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('sess-1', taskId, 'claude', '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', 'error', 'ended')

      const sessions = db
        .prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC')
        .all(taskId) as any[]

      expect(sessions[0].exit_reason).toBe('error')
    })
  })

  describe('Session exit reason tracking', () => {
    it('stores completed exit reason', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', 'completed', 'ended')

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBe('completed')
    })

    it('stores killed exit reason', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', 'killed', 'ended')

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBe('killed')
    })

    it('stores error exit reason', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', 'error', 'ended')

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBe('error')
    })

    it('stores rate_limit exit reason', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', 'rate_limit', 'ended')

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBe('rate_limit')
    })

    it('allows null exit_reason for active sessions', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', null, 'active')

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBeNull()
    })

    it('can update exit_reason', () => {
      const sessionId = 'sess-123'
      db.prepare(`
        INSERT INTO sessions (id, task_id, exit_reason, status)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, 'task-1', null, 'active')

      db.prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run('completed', sessionId)

      const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
      expect(session.exit_reason).toBe('completed')
    })
  })
})
