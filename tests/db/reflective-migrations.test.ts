import { describe, it, expect } from 'vitest'
import { initDb } from '@/lib/db'

describe('migration 65 — pending_jobs', () => {
  it('creates table with dedup_key column and partial index', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(pending_jobs)`).all() as Array<{ name: string; type: string }>
    expect(cols.map(c => c.name)).toEqual(expect.arrayContaining([
      'id', 'kind', 'payload', 'dedup_key', 'state', 'attempts', 'last_error',
      'scheduled_at', 'started_at', 'finished_at',
    ]))
    const indexes = db.prepare(`PRAGMA index_list(pending_jobs)`).all() as Array<{ name: string }>
    expect(indexes.map(i => i.name)).toEqual(expect.arrayContaining([
      'idx_pending_jobs_state_scheduled',
      'idx_pending_jobs_dedup_pending',
    ]))
  })
})

describe('migration 66 — embeddings', () => {
  it('creates table with vector BLOB and (project_id, kind, ref) UNIQUE', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(embeddings)`).all() as Array<{ name: string; type: string }>
    expect(cols.map(c => c.name)).toEqual(expect.arrayContaining([
      'id', 'project_id', 'kind', 'ref', 'content_hash', 'vector', 'dim', 'model', 'updated_at',
    ]))
    expect(cols.find(c => c.name === 'vector')!.type).toBe('BLOB')
  })
})

describe('migrations 67-70 — sessions grade + next_actions columns', () => {
  it('adds grade, grade_reason, graded_at, next_actions all nullable TEXT', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string; type: string; notnull: number }>
    for (const name of ['grade', 'grade_reason', 'graded_at', 'next_actions']) {
      const c = cols.find(x => x.name === name)
      expect(c, `missing column ${name}`).toBeDefined()
      expect(c!.type).toBe('TEXT')
      expect(c!.notnull).toBe(0)
    }
  })
})

describe('migration 71 — critic_findings', () => {
  it('creates table with one row per (project_id, kind, ref)', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(critic_findings)`).all() as Array<{ name: string }>
    expect(cols.map(c => c.name)).toEqual(expect.arrayContaining([
      'id', 'project_id', 'kind', 'ref', 'content_hash', 'findings', 'created_at',
    ]))
  })
})
