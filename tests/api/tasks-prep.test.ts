import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET } from '@/app/api/tasks/[id]/prep/route'
import { getDb, createProject } from '@/lib/db'
import { createTask, setTaskPrep } from '@/lib/db/tasks'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
})

const p = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/tasks/[id]/prep', () => {
  it('returns 404 for unknown task', async () => {
    const res = await GET(new NextRequest('http://localhost/api/tasks/x/prep'), p('x'))
    expect(res.status).toBe(404)
  })

  it('returns parsed prep_notes JSON when ready', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })
    setTaskPrep(db, taskId, {
      status: 'ready',
      prepped_at: '2026-05-01T12:00:00.000Z',
      notes: JSON.stringify({
        summary: 's', intent: 'i', files: [], open_questions: [],
        generated_at: '2026-05-01T12:00:00.000Z', model: 'l',
      }),
    })

    const res = await GET(new NextRequest(`http://localhost/api/tasks/${taskId}/prep`), p(taskId))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
    expect(body.notes.summary).toBe('s')
    expect(body.prepped_at).toBe('2026-05-01T12:00:00.000Z')
  })

  it('returns null notes when prep_status is null', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })

    const res = await GET(new NextRequest(`http://localhost/api/tasks/${taskId}/prep`), p(taskId))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBeNull()
    expect(body.notes).toBeNull()
  })
})
