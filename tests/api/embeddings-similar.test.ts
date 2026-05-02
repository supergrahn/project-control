import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { createProject, getDb } from '@/lib/db'
import { POST } from '@/app/api/projects/[id]/embeddings/similar/route'

let projectId: string

const MODEL = 'test-embed'
const DIM = 4

function vectorBuf(values: number[]): Buffer {
  const arr = Float32Array.from(values)
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}

function insertEmbedding(kind: string, ref: string, vec: number[]) {
  const db = getDb()
  db.prepare(
    `INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(projectId, kind, ref, 'h-' + ref, vectorBuf(vec), DIM, MODEL, '2026-05-02T00:00:00.000Z')
}

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM embeddings').run()
  db.prepare('DELETE FROM projects').run()
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
})

function makeReq(body: unknown): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/projects/${projectId}/embeddings/similar`), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/projects/[id]/embeddings/similar', () => {
  it('returns [] when source ref has no embedding row yet', async () => {
    const res = await POST(makeReq({ kind: 'doc', ref: 'specs/foo.md' }), {
      params: Promise.resolve({ id: projectId }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns 400 when kind/ref missing', async () => {
    const res = await POST(makeReq({}), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(400)
  })

  it('returns ranked matches scoped to resultKinds, excluding the source ref', async () => {
    insertEmbedding('doc', 'specs/foo.md', [1, 0, 0, 0])
    // session_summary candidates — closer first
    insertEmbedding('session_summary', 'sess-aaa', [1, 0, 0, 0])
    insertEmbedding('session_summary', 'sess-bbb', [0.6, 0.8, 0, 0])
    insertEmbedding('session_summary', 'sess-ccc', [0, 1, 0, 0])
    // unrelated kind — must be filtered out
    insertEmbedding('task', 'task-xyz', [1, 0, 0, 0])
    // same ref as source — must be excluded
    insertEmbedding('doc', 'specs/foo.md-extra', [1, 0, 0, 0])

    const res = await POST(
      makeReq({ kind: 'doc', ref: 'specs/foo.md', resultKinds: ['session_summary'], limit: 3 }),
      { params: Promise.resolve({ id: projectId }) },
    )
    expect(res.status).toBe(200)
    const matches = (await res.json()) as Array<{ kind: string; ref: string; score: number }>
    expect(matches.every((m) => m.kind === 'session_summary')).toBe(true)
    expect(matches.map((m) => m.ref)).toEqual(['sess-aaa', 'sess-bbb', 'sess-ccc'])
    expect(matches[0].score).toBeCloseTo(1, 5)
    expect(matches[1].score).toBeCloseTo(0.6, 5)
  })
})
