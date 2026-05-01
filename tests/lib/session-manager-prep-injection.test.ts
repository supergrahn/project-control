import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject } from '@/lib/db'
import { createTask, setTaskPrep } from '@/lib/db/tasks'
import { prepUserContext } from '@/lib/session-manager'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
})

describe('prepUserContext', () => {
  it('returns the original context when taskId is undefined', () => {
    expect(prepUserContext(getDb(), undefined, 'orig')).toBe('orig')
  })

  it('returns the original context when the task has no prep_notes', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    expect(prepUserContext(db, taskId, 'orig')).toBe('orig')
  })

  it('prepends rendered prep when prep_notes is present', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskPrep(db, taskId, {
      status: 'ready',
      prepped_at: '2026-05-01T00:00:00Z',
      notes: JSON.stringify({
        summary: 'login broken', intent: 'callback', files: [],
        open_questions: [], generated_at: '2026-05-01T00:00:00Z', model: 'l',
      }),
    })
    const out = prepUserContext(db, taskId, 'do the work')
    expect(out).toContain('<!-- prep:auto -->')
    expect(out).toContain('login broken')
    expect(out).toContain('do the work')
    expect(out.indexOf('login broken')).toBeLessThan(out.indexOf('do the work'))
  })

  it('does NOT double-inject when the original context already contains the marker', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskPrep(db, taskId, {
      status: 'ready',
      prepped_at: '2026-05-01T00:00:00Z',
      notes: JSON.stringify({
        summary: 's', intent: 'i', files: [], open_questions: [],
        generated_at: '2026-05-01T00:00:00Z', model: 'l',
      }),
    })
    const original = '<!-- prep:auto -->\nold\n\n---\n\ndo the work'
    expect(prepUserContext(db, taskId, original)).toBe(original)
  })
})
