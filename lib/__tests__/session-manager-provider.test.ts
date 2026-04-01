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
      return proc
    }),
  }
})

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run('proj-test', 'Test', '/tmp/test', new Date().toISOString())
  return {
    ...actual,
    getDb: () => db,
    createSession: vi.fn(),
    endSession: vi.fn(),
    getActiveSessionForFile: vi.fn(() => undefined),
    getProject: vi.fn(() => ({ path: '/tmp/test' })),
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

import { spawnSession } from '@/lib/session-manager'

describe('spawnSession provider resolution', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers are configured', () => {
    expect(() => spawnSession({
      projectId: 'proj-test', projectPath: '/tmp/test', label: 'test',
      phase: 'develop', sourceFile: null, userContext: '', permissionMode: 'default',
    })).toThrow('NO_PROVIDERS_CONFIGURED')
  })
})
