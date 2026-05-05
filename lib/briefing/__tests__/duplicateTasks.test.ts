import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import { getDuplicateTasks } from '../duplicateTasks'

function insertProject(db: ReturnType<typeof initDb>, id: string, name = id) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(id, name, `/tmp/${id}`, new Date().toISOString())
}

function insertTask(db: ReturnType<typeof initDb>, opts: { id: string; projectId: string; title: string }) {
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO tasks (id, project_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?)`)
    .run(opts.id, opts.projectId, opts.title, now, now)
}

function vecBuffer(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer)
}

function insertEmbedding(db: ReturnType<typeof initDb>, opts: {
  projectId: string
  taskId: string
  vector: number[]
  model?: string
}) {
  const vec = vecBuffer(opts.vector)
  db.prepare(`INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
              VALUES (?, 'task', ?, ?, ?, ?, ?, ?)`).run(
    opts.projectId,
    opts.taskId,
    'hash-' + opts.taskId,
    vec,
    opts.vector.length,
    opts.model ?? 'test-model',
    new Date().toISOString(),
  )
}

describe('getDuplicateTasks', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1', 'Project One')
  })

  it('returns empty when no embeddings', () => {
    expect(getDuplicateTasks(db)).toEqual([])
  })

  it('returns empty when only one embedding per project', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Solo task' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't1', vector: [1, 0, 0] })
    expect(getDuplicateTasks(db)).toEqual([])
  })

  it('detects identical vectors as duplicates (similarity 1.0)', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Task A' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Task B' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't1', vector: [1, 0, 0] })
    insertEmbedding(db, { projectId: 'p1', taskId: 't2', vector: [1, 0, 0] })
    const out = getDuplicateTasks(db, { threshold: 0.85 })
    expect(out).toHaveLength(1)
    expect(out[0].similarity).toBeCloseTo(1.0)
  })

  it('filters out pairs below threshold', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Task A' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Task B' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't1', vector: [1, 0, 0] })
    insertEmbedding(db, { projectId: 'p1', taskId: 't2', vector: [0, 1, 0] })
    // cosine([1,0,0], [0,1,0]) = 0.0 — below threshold
    expect(getDuplicateTasks(db, { threshold: 0.85 })).toEqual([])
  })

  it('does not compare embeddings with different model strings', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Task A' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Task B' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't1', vector: [1, 0, 0], model: 'model-a' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't2', vector: [1, 0, 0], model: 'model-b' })
    // Different models → different groups → no comparison
    expect(getDuplicateTasks(db, { threshold: 0.5 })).toEqual([])
  })

  it('respects limit option', () => {
    // Create 5 tasks all with identical vectors → 10 pairs
    for (let i = 1; i <= 5; i++) {
      insertTask(db, { id: `t${i}`, projectId: 'p1', title: `Task ${i}` })
      insertEmbedding(db, { projectId: 'p1', taskId: `t${i}`, vector: [1, 0, 0] })
    }
    expect(getDuplicateTasks(db, { threshold: 0.85, limit: 3 })).toHaveLength(3)
  })

  it('includes aTitle, bTitle, projectName in results', () => {
    insertTask(db, { id: 't1', projectId: 'p1', title: 'Task Alpha' })
    insertTask(db, { id: 't2', projectId: 'p1', title: 'Task Beta' })
    insertEmbedding(db, { projectId: 'p1', taskId: 't1', vector: [1, 0, 0] })
    insertEmbedding(db, { projectId: 'p1', taskId: 't2', vector: [1, 0, 0] })
    const out = getDuplicateTasks(db, { threshold: 0.85 })
    expect(out[0].aTitle).toBe('Task Alpha')
    expect(out[0].bTitle).toBe('Task Beta')
    expect(out[0].projectName).toBe('Project One')
  })

  it('respects perProjectCap option', () => {
    // Insert perProjectCap+1 tasks but only perProjectCap are considered
    for (let i = 1; i <= 5; i++) {
      insertTask(db, { id: `t${i}`, projectId: 'p1', title: `Task ${i}` })
      insertEmbedding(db, { projectId: 'p1', taskId: `t${i}`, vector: [1, 0, 0] })
    }
    // With perProjectCap=2, only 2 embeddings fetched → 1 pair
    const out = getDuplicateTasks(db, { threshold: 0.85, perProjectCap: 2 })
    expect(out).toHaveLength(1)
  })
})
