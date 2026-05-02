import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { createProject, getDb } from '@/lib/db'
import { GET } from '@/app/api/projects/[id]/critic-findings/route'

let projectId: string

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM critic_findings').run()
  db.prepare('DELETE FROM projects').run()
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
})

function makeReq(query: Record<string, string>): NextRequest {
  const url = new URL(`http://localhost/api/projects/${projectId}/critic-findings?${new URLSearchParams(query)}`)
  return new NextRequest(url)
}

describe('GET /api/projects/[id]/critic-findings', () => {
  it('returns 400 when ref is missing', async () => {
    const res = await GET(makeReq({}), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(400)
  })

  it('returns null when no findings row exists', async () => {
    const res = await GET(makeReq({ ref: 'docs/superpowers/specs/foo.md' }), {
      params: Promise.resolve({ id: projectId }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toBeNull()
  })

  it('returns parsed findings + content_hash for the latest matching row', async () => {
    const db = getDb()
    const ref = 'docs/superpowers/specs/foo.md'
    const findings = {
      issues: [
        { severity: 'critical', category: 'placeholder', message: 'TODO', line_hint: 47 },
      ],
      votes: 3,
      model: 'm',
      run_at: '2026-05-02T10:00:00.000Z',
    }
    db.prepare(
      `INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, 'spec', ref, 'hash-1', JSON.stringify(findings), '2026-05-02T10:00:00.000Z')

    const res = await GET(makeReq({ ref }), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content_hash).toBe('hash-1')
    expect(body.findings).toEqual(findings)
  })
})
