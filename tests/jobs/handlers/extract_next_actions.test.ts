import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask, updateTask } from '@/lib/db/tasks'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn() }))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: () => ({ id: 'p', name: 'L', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }) }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleExtractNextActions } from '@/lib/jobs/handlers/extract_next_actions'

let db: Database
let sessionId: string
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  sessionId = randomUUID()
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
              VALUES (?, ?, ?, ?, ?, 'ended', ?, ?, ?)`)
    .run(sessionId, projectId, 'L', 'spec', null, new Date().toISOString(), new Date().toISOString(), 'fixed login redirect')
  vi.mocked(localComplete).mockReset()
})

describe('extract_next_actions handler', () => {
  it('writes structured next_actions to the session', async () => {
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({
      next_actions: ['add unit test for redirect', 'document the fix'],
      open_questions: ['should we add CSRF?'],
      files_touched: [{ path: 'lib/auth.ts', change: 'fixed redirect loop' }],
    }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const row = db.prepare(`SELECT next_actions FROM sessions WHERE id = ?`).get(sessionId) as { next_actions: string }
    const parsed = JSON.parse(row.next_actions)
    expect(parsed.next_actions).toHaveLength(2)
    expect(parsed.open_questions).toHaveLength(1)
    expect(parsed.files_touched[0].path).toBe('lib/auth.ts')
    expect(parsed.extracted_at).toBeTruthy()
  })

  it('enqueues refresh_prep for tasks matching files_touched', async () => {
    const t1 = randomUUID()
    createTask(db, { id: t1, projectId, title: 'Auth task' })
    updateTask(db, t1, { idea_file: 'lib/auth.ts' })
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({
      next_actions: [], open_questions: [],
      files_touched: [{ path: 'lib/auth.ts', change: 'x' }],
    }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const job = db.prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'refresh_prep'`).get() as any
    expect(job.kind).toBe('refresh_prep')
    expect(job.dedup_key).toBe(`refresh_prep:${t1}`)
  })

  it('enqueues an embed job for the session_summary', async () => {
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({ next_actions: [], open_questions: [], files_touched: [] }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const job = db.prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'embed'`).get() as any
    expect(job.kind).toBe('embed')
    expect(job.dedup_key).toBe(`embed:${projectId}:session_summary:${sessionId}`)
  })

  it('throws on malformed JSON (lets runner retry)', async () => {
    vi.mocked(localComplete).mockResolvedValue('not json')
    await expect(handleExtractNextActions(db, { session_id: sessionId })).rejects.toThrow()
  })
})
