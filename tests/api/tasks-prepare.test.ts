import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/prep/prepareTask', () => ({
  prepareTask: vi.fn(async () => undefined),
}))

import { POST } from '@/app/api/tasks/[id]/prepare/route'
import { getDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { prepareTask } from '@/lib/prep/prepareTask'

const pt = prepareTask as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
  pt.mockReset()
  pt.mockResolvedValue(undefined)
})

const p = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/tasks/[id]/prepare', () => {
  it('returns 202 and dispatches prepareTask for a real task', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    const taskId = randomUUID()
    createTask(db, { id: taskId, projectId, title: 'T' })

    const req = new NextRequest(`http://localhost/api/tasks/${taskId}/prepare`, { method: 'POST' })
    const res = await POST(req, p(taskId))
    expect(res.status).toBe(202)
    expect(pt).toHaveBeenCalledWith(expect.anything(), taskId)
  })

  it('returns 404 when the task does not exist', async () => {
    const req = new NextRequest('http://localhost/api/tasks/no-such/prepare', { method: 'POST' })
    const res = await POST(req, p('no-such'))
    expect(res.status).toBe(404)
    expect(pt).not.toHaveBeenCalled()
  })
})
