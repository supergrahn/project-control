import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => {
      const { EventEmitter } = require('events')
      const proc = new EventEmitter()
      proc.stdin = { writable: true, write: vi.fn() }
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.kill = vi.fn()
      proc.stdout.on = vi.fn()
      proc.stderr.on = vi.fn()
      setImmediate(() => proc.emit('spawn'))
      return proc
    }),
  }
})

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test', '/tmp', new Date().toISOString())
  db.prepare(`INSERT INTO providers (id, name, type, command, is_active, created_at) VALUES (?, ?, 'claude', '/bin/echo', 1, ?)`)
    .run('pr1', 'mock', new Date().toISOString())
  return {
    ...actual,
    getDb: () => db,
    // We do NOT stub createSession — we need the real implementation so that the
    // spawned session row (and its user_context) is actually written to the DB
    // and we can assert against it.
    getActiveSessionForFile: vi.fn(() => undefined),
    listContextPacks: vi.fn(() => []),
  }
})

vi.mock('@/lib/events', () => ({ logEvent: vi.fn() }))
vi.mock('@/lib/prompts', () => ({
  buildArgs: vi.fn(() => []),
  buildSessionContext: vi.fn(() => ''),
  buildTaskContext: vi.fn(() => ''),
}))
vi.mock('@/lib/db/tasks', () => ({ getTask: vi.fn(() => undefined), updateTask: vi.fn() }))
vi.mock('@/lib/git', () => ({ getGitHistory: vi.fn(() => '') }))
vi.mock('@/lib/frontmatter', () => ({ writeFrontmatter: vi.fn((c: string) => c) }))
vi.mock('@/lib/db/sessionEvents', () => ({
  insertSessionEvent: vi.fn(),
  getSessionEvents: vi.fn(() => []),
  flushSessionEvents: vi.fn(),
}))

vi.mock('@/lib/sessions/adapters', () => ({
  getAdapter: vi.fn(() => ({
    buildArgs: vi.fn(() => []),
    parseLine: vi.fn(() => null),
    resumeArgs: vi.fn(() => []),
    rateLimitPatterns: [],
  })),
}))

import { getDb } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'

function nextActionsJson(next_actions: string[], open_questions: string[] = []) {
  return JSON.stringify({
    next_actions,
    open_questions,
    files_touched: [],
    extracted_at: new Date().toISOString(),
    model: 'llama3',
  })
}

function ensureTask(taskId: string) {
  const db = getDb()
  const exists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId)
  if (!exists) {
    db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, 'p1', ?, 'idea', ?, ?)`)
      .run(taskId, `task-${taskId}`, new Date().toISOString(), new Date().toISOString())
  }
}

function insertPriorSession(opts: {
  id?: string
  taskId?: string | null
  sourceFile?: string | null
  nextActions?: string | null
  summary?: string | null
}) {
  const db = getDb()
  if (opts.taskId) ensureTask(opts.taskId)
  db.prepare(`INSERT INTO sessions
    (id, project_id, label, phase, status, source_file, task_id, summary, next_actions, created_at, ended_at)
    VALUES (?, 'p1', 'Prior label', 'spec', 'ended', ?, ?, ?, ?, ?, ?)`).run(
    opts.id ?? 'prior',
    opts.sourceFile ?? null,
    opts.taskId ?? null,
    opts.summary ?? 'prior summary',
    opts.nextActions ?? nextActionsJson(['follow up X']),
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T00:01:00.000Z',
  )
}

const baseOpts = {
  projectId: 'p1',
  projectPath: '/tmp',
  phase: 'spec' as const,
  sourceFile: null as string | null,
  agentId: null as string | null,
  permissionMode: 'default' as const,
  correctionNote: null as string | null,
  outputPath: null as string | null,
}

describe('spawnSession next-actions carry-forward', () => {
  it('injects prior next_actions when spawning for same taskId', async () => {
    insertPriorSession({ id: 'prior-task', taskId: 't1' })
    ensureTask('t1')
    const newId = await spawnSession({ ...baseOpts, label: 'New', taskId: 't1', userContext: 'do the thing' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).toContain('<!-- next-actions:auto -->')
    expect(row.user_context).toContain('follow up X')
    expect(row.user_context).toContain('do the thing')
  })

  it('does not inject when no prior session has next_actions', async () => {
    ensureTask('t-fresh')
    const newId = await spawnSession({ ...baseOpts, label: 'New', taskId: 't-fresh', userContext: 'do the thing' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).not.toContain('<!-- next-actions:auto -->')
    expect(row.user_context).toContain('do the thing')
  })

  it('does not inject when prior session has empty arrays', async () => {
    ensureTask('t-empty')
    insertPriorSession({ id: 'prior-empty', taskId: 't-empty', nextActions: nextActionsJson([], []) })
    const newId = await spawnSession({ ...baseOpts, label: 'New-empty', taskId: 't-empty', userContext: 'do' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).not.toContain('<!-- next-actions:auto -->')
  })

  it('matches by source_file', async () => {
    const fs = await import('fs')
    const path = '/tmp/next-actions-test-a.md'
    if (!fs.existsSync(path)) fs.writeFileSync(path, '')
    insertPriorSession({ id: 'prior-file', sourceFile: path })
    const newId = await spawnSession({ ...baseOpts, label: 'New-file', sourceFile: path, taskId: null, userContext: '' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).toContain('<!-- next-actions:auto -->')
  })
})
