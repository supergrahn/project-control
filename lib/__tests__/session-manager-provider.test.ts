import { describe, it, expect, vi } from 'vitest'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({ onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() })),
}))

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
vi.mock('@/lib/debrief', () => ({ generateDebrief: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/lib/frontmatter', () => ({ writeFrontmatter: vi.fn((c: string) => c) }))

import { spawnSession } from '@/lib/session-manager'

describe('spawnSession provider resolution', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers are configured', () => {
    expect(() => spawnSession({
      projectId: 'proj-test', projectPath: '/tmp/test', label: 'test',
      phase: 'develop', sourceFile: null, userContext: '', permissionMode: 'default',
    })).toThrow('NO_PROVIDERS_CONFIGURED')
  })
})
