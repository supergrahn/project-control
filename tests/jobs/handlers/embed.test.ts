import { describe, it, expect, vi } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { writeFileSync, mkdtempSync, mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'

vi.mock('@/lib/router/localEmbed', () => ({
  localEmbed: vi.fn(async () => ({
    embeddings: [Float32Array.from([0.1, 0.2, 0.3])],
    model: 'mock-embed',
    dim: 3,
  })),
  getLocalEmbeddingModel: vi.fn(() => 'mock-embed'),
}))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return {
    ...actual,
    getDefaultLocalProvider: () => ({
      id: 'p',
      name: 'Local',
      type: 'ollama',
      command: '',
      config: '{}',
      is_active: 1,
      created_at: '',
    }),
  }
})

import { handleEmbed } from '@/lib/jobs/handlers/embed'

describe('embed handler', () => {
  it('upserts a row for a doc-kind payload after re-reading the file', async () => {
    const db = initDb(':memory:')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'embed-test-'))
    const projectId = createProject(db, { name: 'P', path: tmpDir })
    mkdirSync(join(tmpDir, 'docs'), { recursive: true })
    writeFileSync(join(tmpDir, 'docs/a.md'), '# Hello world')

    const { createHash } = await import('crypto')
    const expectedHash = createHash('sha256').update('# Hello world').digest('hex')

    await handleEmbed(db, {
      project_id: projectId,
      kind: 'doc',
      ref: 'docs/a.md',
      content_hash: expectedHash,
    })

    const row = db
      .prepare(`SELECT * FROM embeddings WHERE project_id = ? AND ref = ?`)
      .get(projectId, 'docs/a.md') as {
      content_hash: string
      dim: number
      model: string
    }
    expect(row.content_hash).toBe(expectedHash)
    expect(row.dim).toBe(3)
    expect(row.model).toBe('mock-embed')
  })

  it('skips when content_hash mismatches (file changed since enqueue)', async () => {
    const db = initDb(':memory:')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'embed-test-'))
    const projectId = createProject(db, { name: 'P', path: tmpDir })
    mkdirSync(join(tmpDir, 'docs'), { recursive: true })
    writeFileSync(join(tmpDir, 'docs/a.md'), 'current content')
    await handleEmbed(db, {
      project_id: projectId,
      kind: 'doc',
      ref: 'docs/a.md',
      content_hash: 'old-hash',
    })
    const row = db.prepare(`SELECT * FROM embeddings WHERE ref = ?`).get('docs/a.md')
    expect(row).toBeUndefined()
  })

  it('marks done when file does not exist (ENOENT)', async () => {
    const db = initDb(':memory:')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'embed-test-'))
    const projectId = createProject(db, { name: 'P', path: tmpDir })
    // Should NOT throw
    await expect(
      handleEmbed(db, {
        project_id: projectId,
        kind: 'doc',
        ref: 'docs/missing.md',
        content_hash: 'h',
      }),
    ).resolves.toBeUndefined()
  })
})
