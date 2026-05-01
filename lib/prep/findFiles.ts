import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Provider } from '@/lib/db/providers'
import { localComplete } from '@/lib/router/localComplete'
import { KEYWORD_PROMPT, RERANK_PROMPT } from './prompts'
import type { PrepFileEntry } from './types'

export type FindFilesInput = {
  title: string
  description: string
}

const MAX_KEYWORDS = 10
const MAX_RIPGREP_HITS = 20
const MAX_RETURN = 5
const PREVIEW_BYTES = 200
// MAX_KEYWORDS * 80 (per-keyword length cap) keeps the alternation regex
// well under any conceivable ARG_MAX. If MAX_KEYWORDS ever grows past ~50,
// the argv length needs revisiting.
const RIPGREP_TIMEOUT_MS = 15000

function parseJsonArray(raw: string): unknown[] | null {
  try {
    const trimmed = raw.trim()
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function extractKeywords(provider: Provider, input: FindFilesInput): Promise<string[]> {
  const prompt = KEYWORD_PROMPT
    .replace('{title}', input.title)
    .replace('{description}', input.description)
  let raw: string
  try {
    raw = await localComplete(provider, prompt, { maxTokens: 200, timeoutMs: 8000 })
  } catch {
    return []
  }
  const parsed = parseJsonArray(raw)
  if (!parsed) return []
  return parsed
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && s.length < 80)
    .slice(0, MAX_KEYWORDS)
}

function runRipgrep(projectPath: string, keywords: string[]): Promise<string[]> {
  if (keywords.length === 0) return Promise.resolve([])
  return new Promise((resolve) => {
    const args = [
      '--files-with-matches',
      '--no-heading',
      '--no-line-number',
      '--hidden',
      '--glob', '!{node_modules,.next,dist,build,.git,coverage,out,.turbo,.cache}/**',
      '-i',
      '--regexp', keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      projectPath,
    ]
    // Ignore stderr — ripgrep emits "permission denied" warnings on hidden /
    // device files even with the exclude glob; an unconsumed pipe could stall
    // the child on a backed-up buffer.
    const proc = spawn('rg', args, { stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    let settled = false
    const finish = (paths: string[]) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      resolve(paths)
    }
    // Kill the subprocess if rg hangs (corrupt fs, NFS stall, etc.) so the
    // outer prepareTask never sits indefinitely with prep_status='prepping'.
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      finish([])
    }, RIPGREP_TIMEOUT_MS)
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.on('error', () => finish([]))
    proc.on('close', () => {
      const paths = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((p) => path.relative(projectPath, p))
      finish(paths.slice(0, MAX_RIPGREP_HITS))
    })
  })
}

function readPreview(absPath: string): string {
  let fd: number | null = null
  try {
    fd = fs.openSync(absPath, 'r')
    const buf = Buffer.alloc(PREVIEW_BYTES)
    const n = fs.readSync(fd, buf, 0, PREVIEW_BYTES, 0)
    return buf.subarray(0, n).toString('utf8').replace(/\s+/g, ' ').slice(0, PREVIEW_BYTES)
  } catch {
    return ''
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd) } catch {}
    }
  }
}

async function rerank(
  provider: Provider,
  input: FindFilesInput,
  projectPath: string,
  candidates: string[],
): Promise<PrepFileEntry[]> {
  const candidateBlock = candidates
    .slice(0, MAX_RIPGREP_HITS)
    .map((p) => `${p}: ${readPreview(path.join(projectPath, p))}`)
    .join('\n')
  const prompt = RERANK_PROMPT
    .replace('{title}', input.title)
    .replace('{description}', input.description)
    .replace('{candidates}', candidateBlock)
  let raw: string
  try {
    raw = await localComplete(provider, prompt, { maxTokens: 600, timeoutMs: 12000 })
  } catch {
    return []
  }
  const parsed = parseJsonArray(raw)
  if (!parsed) return []
  return parsed
    .filter((e): e is { path: string; why: string } =>
      !!e && typeof e === 'object' &&
      typeof (e as { path?: unknown }).path === 'string' &&
      typeof (e as { why?: unknown }).why === 'string',
    )
    .filter((e) => candidates.includes(e.path))
    .slice(0, MAX_RETURN)
}

export async function findRelevantFiles(
  projectPath: string,
  provider: Provider | null,
  input: FindFilesInput,
): Promise<PrepFileEntry[]> {
  if (!provider) return []
  const keywords = await extractKeywords(provider, input)
  if (keywords.length === 0) return []
  const hits = await runRipgrep(projectPath, keywords)
  if (hits.length === 0) return []
  const reranked = await rerank(provider, input, projectPath, hits)
  if (reranked.length > 0) return reranked
  // Best-effort fallback: ripgrep emits files in directory-traversal order, not
  // relevance order, so this list is a coarse "files that mention the keywords"
  // — better than nothing, but the rerank path is the intended primary output.
  return hits.slice(0, MAX_RETURN).map((p) => ({ path: p, why: '' }))
}
