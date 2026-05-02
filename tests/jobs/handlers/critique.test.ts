import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { writeFileSync, mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import os from 'os'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn(), getLocalModelName: () => 'mock-model' }))
vi.mock('@/lib/db/providers', async (o) => {
  const actual = await o<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: () => ({ id: 'p', name: 'L', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }) }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleCritique } from '@/lib/jobs/handlers/critique'

beforeEach(() => {
  vi.mocked(localComplete).mockReset()
})

describe('critique handler', () => {
  it('runs three passes and majority-vote merges issues', async () => {
    const db = initDb(':memory:')
    const tmp = mkdtempSync(join(os.tmpdir(), 'crit-'))
    const projectId = createProject(db, { name: 'P', path: tmp })
    mkdirSync(join(tmp, 'docs/superpowers/specs'), { recursive: true })
    writeFileSync(join(tmp, 'docs/superpowers/specs/x.md'), 'spec body here')
    const { createHash } = await import('crypto')
    const hash = createHash('sha256').update('spec body here').digest('hex')

    // Three runs: two agree on issue A, only one mentions issue B → B is dropped
    vi.mocked(localComplete)
      .mockResolvedValueOnce(JSON.stringify({ issues: [
        { severity: 'critical', category: 'placeholder', message: 'TODO appears at line 47' },
        { severity: 'minor', category: 'naming', message: 'Inconsistent function naming' },
      ]}))
      .mockResolvedValueOnce(JSON.stringify({ issues: [
        { severity: 'critical', category: 'placeholder', message: 'TODO appears at line 47' },
      ]}))
      .mockResolvedValueOnce(JSON.stringify({ issues: [
        { severity: 'critical', category: 'placeholder', message: 'TODO appears at line 47' },
      ]}))

    await handleCritique(db, { project_id: projectId, ref: 'docs/superpowers/specs/x.md', kind: 'spec', content_hash: hash })

    const row = db.prepare(`SELECT findings FROM critic_findings WHERE ref = ?`).get('docs/superpowers/specs/x.md') as any
    const findings = JSON.parse(row.findings)
    expect(findings.issues).toHaveLength(1)
    expect(findings.issues[0].category).toBe('placeholder')
    expect(findings.votes).toBe(3)
  })
})
