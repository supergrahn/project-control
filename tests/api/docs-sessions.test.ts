import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { createProject, getDb } from '@/lib/db'
import { GET } from '@/app/api/projects/[id]/docs/sessions/route'

let projectId: string

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM projects').run()
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
})

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/projects/' + projectId + '/docs/sessions?' + new URLSearchParams(params))
  return new NextRequest(url)
}

describe('GET /api/projects/[id]/docs/sessions', () => {
  it('returns 400 when file query param missing', async () => {
    const res = await GET(makeReq({}), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(400)
  })

  it('returns sessions filtered by source_file (converted to absolute), newest first', async () => {
    const db = getDb()
    const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as { path: string }
    const projectPath = project.path
    const earlier = '2026-05-01T08:00:00.000Z'
    const later = '2026-05-02T08:00:00.000Z'
    const a = randomUUID()
    const b = randomUUID()
    // source_file is stored ABSOLUTE — the API converts the relative ?file= input to absolute.
    const fooAbs = projectPath + '/specs/foo.md'
    const otherAbs = projectPath + '/specs/other.md'
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a, projectId, 'first', 'spec', fooAbs, 'ended', earlier, earlier, 'first wrap-up')
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(b, projectId, 'second', 'spec', fooAbs, 'ended', later, later, 'second wrap-up')
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), projectId, 'unrelated', 'spec', otherAbs, 'ended', later, later)

    const res = await GET(makeReq({ file: 'specs/foo.md' }), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; summary: string }>
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe(b)  // newest first
    expect(body[1].id).toBe(a)
  })

  it('returns empty array for unknown file', async () => {
    const res = await GET(makeReq({ file: 'nope.md' }), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})
