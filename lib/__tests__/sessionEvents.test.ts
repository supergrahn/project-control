import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import {
  insertSessionEvent,
  getSessionEvents,
  flushSessionEvents,
  deleteSessionEvents,
} from '@/lib/db/sessionEvents'
import type { TranscriptEvent } from '@/lib/sessions/adapters/types'
import fs from 'fs'
import path from 'path'
import os from 'os'

let db: ReturnType<typeof initDb>

beforeEach(() => {
  db = initDb(':memory:')
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run('p1', 'Test', '/tmp/test', new Date().toISOString())
  db.prepare("INSERT INTO sessions (id, project_id, label, phase, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)").run('s1', 'p1', 'test', 'develop', new Date().toISOString())
})

describe('insertSessionEvent', () => {
  it('inserts an event and assigns an auto-increment id', () => {
    const event: TranscriptEvent = { type: 'message', role: 'assistant', content: 'Hello' }
    const id = insertSessionEvent(db, 's1', event)
    expect(id).toBe(1)
  })

  it('stores metadata as JSON string', () => {
    const event: TranscriptEvent = { type: 'tokens', metadata: { input: 100, output: 50 } }
    insertSessionEvent(db, 's1', event)
    const rows = getSessionEvents(db, 's1')
    expect(JSON.parse(rows[0].metadata!)).toEqual({ input: 100, output: 50 })
  })
})

describe('getSessionEvents', () => {
  it('returns events ordered by id ascending', () => {
    insertSessionEvent(db, 's1', { type: 'init', metadata: { sessionId: 's1', model: 'test', provider: 'claude' } })
    insertSessionEvent(db, 's1', { type: 'message', role: 'assistant', content: 'Hi' })
    insertSessionEvent(db, 's1', { type: 'tokens', metadata: { input: 10, output: 5 } })
    const events = getSessionEvents(db, 's1')
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('init')
    expect(events[1].type).toBe('message')
    expect(events[2].type).toBe('tokens')
  })

  it('returns empty array for unknown session', () => {
    expect(getSessionEvents(db, 'nope')).toEqual([])
  })
})

describe('flushSessionEvents', () => {
  it('writes events as NDJSON to the given file path', () => {
    insertSessionEvent(db, 's1', { type: 'message', role: 'assistant', content: 'Hello' })
    insertSessionEvent(db, 's1', { type: 'tokens', metadata: { input: 10, output: 5 } })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-test-'))
    const filePath = path.join(tmpDir, 's1.jsonl')

    flushSessionEvents(db, 's1', filePath)

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).type).toBe('message')
    expect(JSON.parse(lines[1]).type).toBe('tokens')

    expect(getSessionEvents(db, 's1')).toEqual([])

    fs.rmSync(tmpDir, { recursive: true })
  })
})

describe('deleteSessionEvents', () => {
  it('deletes all events for a session', () => {
    insertSessionEvent(db, 's1', { type: 'raw', content: 'test' })
    insertSessionEvent(db, 's1', { type: 'raw', content: 'test2' })
    deleteSessionEvents(db, 's1')
    expect(getSessionEvents(db, 's1')).toEqual([])
  })
})
