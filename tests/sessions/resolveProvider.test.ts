import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, setTaskComplexity, updateTask } from '@/lib/db/tasks'
import { resolveProvider } from '@/lib/sessions/resolveProvider'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

describe('resolveProvider', () => {
  it('honors a task-pinned provider (router not invoked)', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    createProvider(db, { id: 'p-pinned', name: 'X', type: 'claude', command: 'c', config: null })
    createProvider(db, { id: 'p-other',  name: 'Y', type: 'codex',  command: 'c', config: null })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    updateTask(db, taskId, { provider_id: 'p-pinned' })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, taskId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-pinned')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(0)  // pin path skips router
  })

  it('honors a project-pinned provider (router not invoked)', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p2' })
    createProvider(db, { id: 'p-pinned', name: 'X', type: 'claude', command: 'c', config: null })
    createProvider(db, { id: 'p-other',  name: 'Y', type: 'codex',  command: 'c', config: null })
    db.prepare('UPDATE projects SET provider_id = ? WHERE id = ?').run('p-pinned', projectId)
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-pinned')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(0)
  })

  it('invokes the router when nothing is pinned and writes a decision row', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p3' })
    // single provider so we don't have to predict the router's pick by suitability
    createProvider(db, { id: 'p-codex', name: 'codex', type: 'codex', command: 'c', config: null })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-codex')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(1)
  })

  it('forwards taskId so the persisted decision references the task and reflects its complexity', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p4' })
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'c', config: null })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'hard', false)
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'plan', sourceFile: null })

    await resolveProvider(db, { projectId, taskId, phase: 'plan', sessionId })
    const row = db
      .prepare('SELECT task_id, complexity FROM routing_decisions WHERE session_id = ?')
      .get(sessionId) as { task_id: string; complexity: string }
    expect(row.task_id).toBe(taskId)
    expect(row.complexity).toBe('hard')
  })
})
