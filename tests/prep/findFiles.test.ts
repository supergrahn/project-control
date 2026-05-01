import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))

import { findRelevantFiles } from '@/lib/prep/findFiles'
import { localComplete } from '@/lib/router/localComplete'

const lc = localComplete as unknown as ReturnType<typeof vi.fn>

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prep-files-'))
  lc.mockReset()
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function provider() {
  return {
    id: 'p', name: 'L', type: 'ollama' as const, command: 'ollama',
    config: null, is_active: 1, created_at: '2026-05-01T00:00:00Z',
  }
}

describe('findRelevantFiles', () => {
  it('returns [] when no local provider is given', async () => {
    const out = await findRelevantFiles(tmpDir, null, { title: 'x', description: 'y' })
    expect(out).toEqual([])
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns [] when keyword extraction fails', async () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.ts'), 'const x = 1')
    lc.mockRejectedValueOnce(new Error('timeout'))
    const out = await findRelevantFiles(tmpDir, provider(), { title: 'fix bug', description: 'broken' })
    expect(out).toEqual([])
  })

  it('returns [] when keyword extraction yields no usable keywords', async () => {
    lc.mockResolvedValueOnce('not a json array')
    const out = await findRelevantFiles(tmpDir, provider(), { title: 't', description: 'd' })
    expect(out).toEqual([])
  })

  it('runs ripgrep and reranks via LLM, returning top-N entries', async () => {
    fs.mkdirSync(path.join(tmpDir, 'lib', 'auth'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'lib', 'auth', 'sso.ts'), 'function ssoCallback() {}')
    fs.writeFileSync(path.join(tmpDir, 'lib', 'auth', 'config.ts'), 'export const ssoRedirectUrl = "/cb"')
    fs.writeFileSync(path.join(tmpDir, 'lib', 'unrelated.ts'), 'const x = 1')

    lc.mockResolvedValueOnce(JSON.stringify(['sso', 'callback']))
    lc.mockResolvedValueOnce(JSON.stringify([
      { path: 'lib/auth/sso.ts',    why: 'callback handler' },
      { path: 'lib/auth/config.ts', why: 'redirect URL config' },
    ]))

    const out = await findRelevantFiles(tmpDir, provider(), {
      title: 'SSO callback breaks',
      description: 'Login fails after the redirect.',
    })

    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ path: 'lib/auth/sso.ts', why: 'callback handler' })
    expect(out[1]).toEqual({ path: 'lib/auth/config.ts', why: 'redirect URL config' })
    expect(lc).toHaveBeenCalledTimes(2)
  })

  it('falls back to ripgrep top hits with empty why when rerank fails', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'logger.error()')
    fs.writeFileSync(path.join(tmpDir, 'b.ts'), 'logger.warn()')
    lc.mockResolvedValueOnce(JSON.stringify(['logger']))
    lc.mockResolvedValueOnce('not a json array')

    const out = await findRelevantFiles(tmpDir, provider(), { title: 'logging issue', description: 'hot path' })

    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThanOrEqual(5)
    for (const entry of out) {
      expect(entry.why).toBe('')
      expect(typeof entry.path).toBe('string')
    }
  })

  it('returns [] when ripgrep finds no matches (still calls keywords)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.ts'), 'const x = 1')
    lc.mockResolvedValueOnce(JSON.stringify(['nothingsuchstring']))

    const out = await findRelevantFiles(tmpDir, provider(), { title: 't', description: 'd' })

    expect(out).toEqual([])
    expect(lc).toHaveBeenCalledTimes(1)
  })
})
