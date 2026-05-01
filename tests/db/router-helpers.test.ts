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

  it('returns the first active ollama provider', () => {
    const db = getDb()
    createProvider(db, { id: 'a', name: 'L1', type: 'ollama', command: 'ollama', config: null })
    createProvider(db, { id: 'b', name: 'L2', type: 'ollama', command: 'ollama', config: null })
    const p = getDefaultLocalProvider(db)
    expect(p?.id).toBe('a')
  })
})

describe('setTaskComplexity', () => {
  it('writes both complexity and complexity_overridden atomically', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'hard', true)
    const t = getTask(db, taskId)!
    expect(t.complexity).toBe('hard')
    expect(t.complexity_overridden).toBe(1)
  })

  it('overridden=false writes 0', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'normal', false)
    const t = getTask(db, taskId)!
    expect(t.complexity).toBe('normal')
    expect(t.complexity_overridden).toBe(0)
  })
})
