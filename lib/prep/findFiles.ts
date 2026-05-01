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
    const proc = spawn('rg', args)
    let stdout = ''
    proc.stdout?.on('data', (d) => { stdout += d.toString() })
    proc.on('error', () => resolve([]))
    proc.on('close', () => {
      const paths = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((p) => path.relative(projectPath, p))
      resolve(paths.slice(0, MAX_RIPGREP_HITS))
    })
  })
}

function readPreview(absPath: string): string {
  try {
    const fd = fs.openSync(absPath, 'r')
    const buf = Buffer.alloc(PREVIEW_BYTES)
    const n = fs.readSync(fd, buf, 0, PREVIEW_BYTES, 0)
    fs.closeSync(fd)
    return buf.subarray(0, n).toString('utf8').replace(/\s+/g, ' ').slice(0, PREVIEW_BYTES)
  } catch {
    return ''
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
  return hits.slice(0, MAX_RETURN).map((p) => ({ path: p, why: '' }))
}
