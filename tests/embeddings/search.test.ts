import { describe, it, expect } from 'vitest'
import { findSimilar } from '@/lib/embeddings/search'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'

function insertEmbedding(
  db: Database.Database,
  project_id: string,
  kind: string,
  ref: string,
  vector: number[],
  model = 'm',
  dim?: number,
) {
  const arr = Float32Array.from(vector)
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
  db.prepare(
    `INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    project_id,
    kind,
    ref,
    'h',
    buf,
    dim ?? vector.length,
    model,
    new Date().toISOString(),
  )
}

describe('findSimilar', () => {
  it('ranks by cosine similarity descending', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    insertEmbedding(db, p, 'doc', 'a.md', [1, 0, 0])
    insertEmbedding(db, p, 'doc', 'b.md', [0.9, 0.1, 0])
    insertEmbedding(db, p, 'doc', 'c.md', [0, 1, 0])

    const result = findSimilar(db, {
      projectId: p,
      queryVector: Float32Array.from([1, 0, 0]),
      queryDim: 3,
      queryModel: 'm',
      kinds: ['doc'],
    })
    expect(result.map((r) => r.ref)).toEqual(['a.md', 'b.md', 'c.md'])
    expect(result[0].score).toBeCloseTo(1.0, 3)
  })

  it('filters out rows with different model', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    insertEmbedding(db, p, 'doc', 'a.md', [1, 0, 0], 'modelA')
    insertEmbedding(db, p, 'doc', 'b.md', [1, 0, 0], 'modelB')
    const result = findSimilar(db, {
      projectId: p,
      queryVector: Float32Array.from([1, 0, 0]),
      queryDim: 3,
      queryModel: 'modelA',
      kinds: ['doc'],
    })
    expect(result.map((r) => r.ref)).toEqual(['a.md'])
  })

  it('respects excludeRef', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    insertEmbedding(db, p, 'doc', 'a.md', [1, 0])
    insertEmbedding(db, p, 'doc', 'b.md', [1, 0])
    const result = findSimilar(db, {
      projectId: p,
      queryVector: Float32Array.from([1, 0]),
      queryDim: 2,
      queryModel: 'm',
      kinds: ['doc'],
      excludeRef: 'a.md',
    })
    expect(result.map((r) => r.ref)).toEqual(['b.md'])
  })

  it('respects limit', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    for (let i = 0; i < 10; i++) insertEmbedding(db, p, 'doc', `${i}.md`, [1, 0])
    const result = findSimilar(db, {
      projectId: p,
      queryVector: Float32Array.from([1, 0]),
      queryDim: 2,
      queryModel: 'm',
      kinds: ['doc'],
      limit: 3,
    })
    expect(result).toHaveLength(3)
  })
})
