import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject } from '@/lib/db'
import { createProvider, getDefaultLocalProvider } from '@/lib/db/providers'
import { createTask, getTask, setTaskComplexity } from '@/lib/db/tasks'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
})

describe('getDefaultLocalProvider', () => {
  it('returns null when no ollama provider exists', () => {
    expect(getDefaultLocalProvider(getDb())).toBeNull()
  })

  it('returns null when ollama provider exists but is inactive', () => {
    const db = getDb()
    createProvider(db, { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    db.prepare('UPDATE providers SET is_active = 0').run()
    expect(getDefaultLocalProvider(db)).toBeNull()
  })

  it('returns the active ollama provider when one is configured', () => {
    const db = getDb()
    createProvider(db, { id: 'a', name: 'L1', type: 'ollama', command: 'ollama', config: null })
    createProvider(db, { id: 'b', name: 'L2', type: 'ollama', command: 'ollama', config: null })
    const p = getDefaultLocalProvider(db)
    // millisecond-resolution created_at can tie; assert membership rather than strict ordering
    expect(p).not.toBeNull()
    expect(['a', 'b']).toContain(p!.id)
  })
})

describe('setTaskComplexity', () => {
  it('writes both complexity and complexity_overridden atomically and returns the updated task', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    const updated = setTaskComplexity(db, taskId, 'hard', true)
    expect(updated.complexity).toBe('hard')
    expect(updated.complexity_overridden).toBe(1)
    const t = getTask(db, taskId)!
    expect(t.complexity).toBe('hard')
    expect(t.complexity_overridden).toBe(1)
  })

  it('overridden=false writes 0', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    const updated = setTaskComplexity(db, taskId, 'normal', false)
    expect(updated.complexity).toBe('normal')
    expect(updated.complexity_overridden).toBe(0)
  })

  it('throws when the task does not exist', () => {
    expect(() => setTaskComplexity(getDb(), 'no-such-id', 'normal', false))
      .toThrow(/not found/)
  })
})
