# Headless-First Session Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PTY-based session spawning with pipe-based headless sessions, adding per-provider NDJSON parsing, a session events table, and an input bar on the task page.

**Architecture:** All CLI processes are spawned with `child_process.spawn` (pipes, not PTY). Each provider has an adapter that builds CLI args and parses NDJSON lines into a common `TranscriptEvent` type. Events are stored in a `session_events` table during the session, flushed to a `.jsonl` log file on session end, and referenced on the task record. The task detail page gets a `SessionInput` component below the terminal output for sending text to stdin.

**Tech Stack:** Node.js `child_process`, better-sqlite3, WebSocket (`ws`), React, Next.js App Router, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-headless-sessions-design.md`

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `lib/sessions/adapters/types.ts` | `TranscriptEvent`, `AdapterModule`, `BuildArgsOpts` types |
| `lib/sessions/adapters/claude.ts` | Claude CLI arg builder, stream-json line parser, rate limit patterns |
| `lib/sessions/adapters/gemini.ts` | Gemini CLI arg builder, stream-json line parser, rate limit patterns |
| `lib/sessions/adapters/codex.ts` | Codex CLI arg builder, NDJSON line parser, rate limit patterns |
| `lib/sessions/adapters/ollama.ts` | Ollama CLI arg builder, raw passthrough parser |
| `lib/sessions/adapters/index.ts` | `getAdapter(providerType)` registry |
| `lib/db/sessionEvents.ts` | CRUD for `session_events` table + flush-to-file helper |
| `components/tasks/SessionInput.tsx` | Text input + send button for writing to session stdin |
| `lib/__tests__/adapters-claude.test.ts` | Claude adapter unit tests |
| `lib/__tests__/adapters-gemini.test.ts` | Gemini adapter unit tests |
| `lib/__tests__/adapters-codex.test.ts` | Codex adapter unit tests |
| `lib/__tests__/adapters-ollama.test.ts` | Ollama adapter unit tests |
| `lib/__tests__/sessionEvents.test.ts` | Session events CRUD + flush tests |
| `components/__tests__/SessionInput.test.tsx` | SessionInput component tests |

### Modified

| File | Change |
|---|---|
| `lib/db.ts` | Add `session_events` table migration, add `session_log` column on tasks |
| `lib/db/tasks.ts` | Add `session_log` to `Task` type |
| `lib/session-manager.ts` | Full rewrite: `child_process.spawn` instead of `node-pty`, adapter-based parsing, events table, remove `outputBuffer` |
| `lib/prompts.ts` | `buildArgs()` delegates to adapter via `providerType` param |
| `server.ts` | Shutdown handler kills `ChildProcess` instead of PTY |
| `components/tasks/LiveRunsSection.tsx` | Add `SessionInput` below terminal output |
| `lib/__tests__/session-manager-provider.test.ts` | Remove `node-pty` mock, use `child_process` mock |
| `lib/__tests__/rateLimitDetector.test.ts` | Delete (replaced by per-adapter tests) |
| `package.json` | Remove `node-pty` dependency |

### Deleted

| File | Reason |
|---|---|
| `lib/sessions/rateLimitDetector.ts` | Absorbed into per-adapter `rateLimitPatterns` |
| `lib/debrief.ts` | Replaced by structured event logs |

---

### Task 1: Adapter types and registry

**Files:**
- Create: `lib/sessions/adapters/types.ts`
- Create: `lib/sessions/adapters/index.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/sessions/adapters/types.ts
import type { PermissionMode } from '@/lib/prompts'

export type TranscriptEvent = {
  type: 'init' | 'message' | 'thinking' | 'tool_call' | 'tool_result' | 'tokens' | 'error' | 'raw'
  role?: 'user' | 'assistant' | 'system'
  content?: string
  metadata?: Record<string, unknown>
}

export type BuildArgsOpts = {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
}

export type AdapterModule = {
  buildArgs(opts: BuildArgsOpts): string[]
  parseLine(line: string): TranscriptEvent | null
  resumeArgs(sessionId: string): string[]
  rateLimitPatterns: RegExp[]
}
```

- [ ] **Step 2: Create the adapter registry**

```typescript
// lib/sessions/adapters/index.ts
import type { ProviderType } from '@/lib/db/providers'
import type { AdapterModule } from './types'

const adapters: Record<ProviderType, () => Promise<AdapterModule>> = {
  claude: () => import('./claude').then(m => m.claudeAdapter),
  gemini: () => import('./gemini').then(m => m.geminiAdapter),
  codex:  () => import('./codex').then(m => m.codexAdapter),
  ollama: () => import('./ollama').then(m => m.ollamaAdapter),
}

// Cached sync references — populated on first use
const cache = new Map<ProviderType, AdapterModule>()

export function getAdapter(type: ProviderType): AdapterModule {
  const cached = cache.get(type)
  if (cached) return cached
  // Adapters are lightweight — require synchronously for server-side use
  /* eslint-disable @typescript-eslint/no-require-imports */
  switch (type) {
    case 'claude': { const m = require('./claude'); cache.set(type, m.claudeAdapter); return m.claudeAdapter }
    case 'gemini': { const m = require('./gemini'); cache.set(type, m.geminiAdapter); return m.geminiAdapter }
    case 'codex':  { const m = require('./codex');  cache.set(type, m.codexAdapter);  return m.codexAdapter }
    case 'ollama': { const m = require('./ollama'); cache.set(type, m.ollamaAdapter); return m.ollamaAdapter }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/sessions/adapters/types.ts lib/sessions/adapters/index.ts
git commit -m "feat: add adapter types and registry for headless sessions"
```

---

### Task 2: Claude adapter

**Files:**
- Create: `lib/sessions/adapters/claude.ts`
- Create: `lib/__tests__/adapters-claude.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/adapters-claude.test.ts
import { describe, it, expect } from 'vitest'
import { claudeAdapter } from '@/lib/sessions/adapters/claude'

describe('claudeAdapter.buildArgs', () => {
  it('builds args with --print --output-format stream-json', () => {
    const args = claudeAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--system-prompt')
    expect(args).toContain('You are helpful')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-123')
    expect(args).toContain('--permission-mode')
    expect(args).toContain('default')
    expect(args[args.length - 1]).toBe('Fix the bug')
  })

  it('omits trailing user context when empty', () => {
    const args = claudeAdapter.buildArgs({
      systemPrompt: 'prompt',
      userContext: '  ',
      permissionMode: 'default',
      sessionId: 'sess-1',
    })
    expect(args[args.length - 1]).not.toBe('  ')
  })
})

describe('claudeAdapter.resumeArgs', () => {
  it('builds resume args with --resume flag', () => {
    const args = claudeAdapter.resumeArgs('sess-abc')
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--resume')
    expect(args).toContain('sess-abc')
  })
})

describe('claudeAdapter.parseLine', () => {
  it('parses system init event', () => {
    const line = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-sonnet-4-5-20250514' })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 's1', model: 'claude-sonnet-4-5-20250514', provider: 'claude' },
    })
  })

  it('parses assistant message event', () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello world' }] } })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'Hello world',
    })
  })

  it('parses result event with usage', () => {
    const line = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50 },
      total_cost_usd: 0.003,
    })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 1000, output: 200, cached: 50, costUsd: 0.003 },
    })
  })

  it('returns raw event for unparseable line', () => {
    const event = claudeAdapter.parseLine('not json at all')
    expect(event).toEqual({ type: 'raw', content: 'not json at all' })
  })

  it('returns null for empty line', () => {
    expect(claudeAdapter.parseLine('')).toBeNull()
    expect(claudeAdapter.parseLine('  ')).toBeNull()
  })
})

describe('claudeAdapter.rateLimitPatterns', () => {
  it('detects rate_limit_exceeded', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('rate_limit_exceeded'))).toBe(true)
  })
  it('detects overloaded_error', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('overloaded_error'))).toBe(true)
  })
  it('detects 529', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('HTTP 529 Overloaded'))).toBe(true)
  })
  it('ignores normal text', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('Reading file'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/adapters-claude.test.ts`
Expected: FAIL — cannot resolve `@/lib/sessions/adapters/claude`

- [ ] **Step 3: Implement the Claude adapter**

```typescript
// lib/sessions/adapters/claude.ts
import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--system-prompt', opts.systemPrompt,
    '--session-id', opts.sessionId,
    '--permission-mode', opts.permissionMode,
  ]
  if (opts.userContext.trim()) {
    args.push(opts.userContext.trim())
  }
  return args
}

function resumeArgs(sessionId: string): string[] {
  return ['--print', '--output-format', 'stream-json', '--verbose', '--resume', sessionId]
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { type: 'raw', content: trimmed }
  }

  // system init
  if (data.type === 'system' && data.subtype === 'init') {
    return {
      type: 'init',
      metadata: {
        sessionId: data.session_id as string,
        model: data.model as string,
        provider: 'claude',
      },
    }
  }

  // assistant message
  if (data.type === 'assistant' && data.message) {
    const msg = data.message as { content?: Array<{ type: string; text?: string }> }
    const textBlocks = (msg.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '')
    if (textBlocks.length > 0) {
      return { type: 'message', role: 'assistant', content: textBlocks.join('\n') }
    }
  }

  // result with usage
  if (data.type === 'result' && data.usage) {
    const usage = data.usage as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cached: usage.cache_read_input_tokens ?? 0,
        costUsd: (data.total_cost_usd as number) ?? 0,
      },
    }
  }

  return { type: 'raw', content: trimmed }
}

const rateLimitPatterns: RegExp[] = [
  /rate_limit_exceeded/,
  /overloaded_error/,
  /\b529\b/,
]

export const claudeAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/adapters-claude.test.ts`
Expected: PASS (all 11 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/adapters/claude.ts lib/__tests__/adapters-claude.test.ts
git commit -m "feat: add Claude adapter — buildArgs, parseLine, resumeArgs"
```

---

### Task 3: Gemini adapter

**Files:**
- Create: `lib/sessions/adapters/gemini.ts`
- Create: `lib/__tests__/adapters-gemini.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/adapters-gemini.test.ts
import { describe, it, expect } from 'vitest'
import { geminiAdapter } from '@/lib/sessions/adapters/gemini'

describe('geminiAdapter.buildArgs', () => {
  it('builds args with -p and --output-format stream-json', () => {
    const args = geminiAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-123')
    // System prompt and user context are combined into the -p value
    const pIdx = args.indexOf('-p')
    expect(args[pIdx + 1]).toContain('Fix the bug')
  })
})

describe('geminiAdapter.resumeArgs', () => {
  it('builds resume args with --session-id', () => {
    const args = geminiAdapter.resumeArgs('sess-abc')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-abc')
  })
})

describe('geminiAdapter.parseLine', () => {
  it('parses init event', () => {
    const line = JSON.stringify({ type: 'init', session_id: 's1', model: 'auto-gemini-3', timestamp: '2026-04-01T09:00:00Z' })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 's1', model: 'auto-gemini-3', provider: 'gemini' },
    })
  })

  it('parses assistant message event', () => {
    const line = JSON.stringify({ type: 'message', role: 'assistant', content: 'The answer is 4.', delta: true, timestamp: '2026-04-01T09:00:01Z' })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'The answer is 4.',
      metadata: { delta: true },
    })
  })

  it('parses result event with stats', () => {
    const line = JSON.stringify({
      type: 'result',
      status: 'success',
      stats: { total_tokens: 13404, input_tokens: 13290, output_tokens: 32, cached: 0, duration_ms: 16892, tool_calls: 0 },
    })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 13290, output: 32, cached: 0, costUsd: 0 },
    })
  })

  it('returns raw event for unparseable line', () => {
    const event = geminiAdapter.parseLine('garbage')
    expect(event).toEqual({ type: 'raw', content: 'garbage' })
  })

  it('returns null for empty line', () => {
    expect(geminiAdapter.parseLine('')).toBeNull()
  })
})

describe('geminiAdapter.rateLimitPatterns', () => {
  it('detects RESOURCE_EXHAUSTED', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('RESOURCE_EXHAUSTED'))).toBe(true)
  })
  it('detects quota exceeded', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('quota exceeded for project'))).toBe(true)
  })
  it('detects 429', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('429 from API'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/adapters-gemini.test.ts`
Expected: FAIL — cannot resolve `@/lib/sessions/adapters/gemini`

- [ ] **Step 3: Implement the Gemini adapter**

```typescript
// lib/sessions/adapters/gemini.ts
import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const prompt = `${opts.systemPrompt}\n\n---\n\n${opts.userContext}`.trim()
  return ['-p', prompt, '--output-format', 'stream-json', '--session-id', opts.sessionId]
}

function resumeArgs(sessionId: string): string[] {
  return ['--output-format', 'stream-json', '--session-id', sessionId]
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { type: 'raw', content: trimmed }
  }

  if (data.type === 'init') {
    return {
      type: 'init',
      metadata: {
        sessionId: (data.session_id ?? data.sessionId ?? '') as string,
        model: (data.model ?? '') as string,
        provider: 'gemini',
      },
    }
  }

  if (data.type === 'message' && data.role === 'assistant') {
    return {
      type: 'message',
      role: 'assistant',
      content: (data.content ?? '') as string,
      metadata: data.delta ? { delta: true } : undefined,
    }
  }

  if (data.type === 'result' && data.stats) {
    const stats = data.stats as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: stats.input_tokens ?? stats.inputTokens ?? stats.promptTokenCount ?? 0,
        output: stats.output_tokens ?? stats.outputTokens ?? stats.candidatesTokenCount ?? 0,
        cached: stats.cached ?? 0,
        costUsd: (data.cost_usd as number) ?? 0,
      },
    }
  }

  return { type: 'raw', content: trimmed }
}

const HTTP_429 = /(?<![=]\s{0,5})\b429\b/

const rateLimitPatterns: RegExp[] = [
  /RESOURCE_EXHAUSTED/,
  /quota exceeded/i,
  HTTP_429,
]

export const geminiAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/adapters-gemini.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/adapters/gemini.ts lib/__tests__/adapters-gemini.test.ts
git commit -m "feat: add Gemini adapter — buildArgs, parseLine, resumeArgs"
```

---

### Task 4: Codex adapter

**Files:**
- Create: `lib/sessions/adapters/codex.ts`
- Create: `lib/__tests__/adapters-codex.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/adapters-codex.test.ts
import { describe, it, expect } from 'vitest'
import { codexAdapter } from '@/lib/sessions/adapters/codex'

describe('codexAdapter.buildArgs', () => {
  it('builds args with exec subcommand', () => {
    const args = codexAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args[0]).toBe('exec')
    expect(args).toContain('Fix the bug')
  })
})

describe('codexAdapter.resumeArgs', () => {
  it('builds resume args with --session-id', () => {
    const args = codexAdapter.resumeArgs('sess-abc')
    expect(args[0]).toBe('exec')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-abc')
  })
})

describe('codexAdapter.parseLine', () => {
  it('parses thread.started event', () => {
    const line = JSON.stringify({ type: 'thread.started', thread_id: 't1' })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 't1', model: 'codex', provider: 'codex' },
    })
  })

  it('parses item.completed with agent message', () => {
    const line = JSON.stringify({ type: 'item.completed', item: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] } })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'Done',
    })
  })

  it('parses turn.completed with usage', () => {
    const line = JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 500, output_tokens: 100 } })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 500, output: 100, cached: 0, costUsd: 0 },
    })
  })

  it('parses turn.failed as error', () => {
    const line = JSON.stringify({ type: 'turn.failed', error: 'something broke' })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'error',
      content: 'something broke',
      metadata: { code: 'turn.failed', isRateLimit: false },
    })
  })

  it('returns raw for unparseable', () => {
    expect(codexAdapter.parseLine('nope')).toEqual({ type: 'raw', content: 'nope' })
  })

  it('returns null for empty', () => {
    expect(codexAdapter.parseLine('')).toBeNull()
  })
})

describe('codexAdapter.rateLimitPatterns', () => {
  it('detects rate_limit_exceeded', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('rate_limit_exceeded'))).toBe(true)
  })
  it('detects quota_exceeded', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('quota_exceeded'))).toBe(true)
  })
  it('detects 429', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('Response 429'))).toBe(true)
  })
  it('ignores const x = 429', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('const x = 429'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/adapters-codex.test.ts`
Expected: FAIL — cannot resolve `@/lib/sessions/adapters/codex`

- [ ] **Step 3: Implement the Codex adapter**

```typescript
// lib/sessions/adapters/codex.ts
import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  const prompt = `${opts.systemPrompt}\n\n---\n\n${opts.userContext}`.trim()
  return ['exec', prompt]
}

function resumeArgs(sessionId: string): string[] {
  return ['exec', '--session-id', sessionId]
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let data: Record<string, unknown>
  try {
    data = JSON.parse(trimmed)
  } catch {
    return { type: 'raw', content: trimmed }
  }

  if (data.type === 'thread.started') {
    return {
      type: 'init',
      metadata: {
        sessionId: (data.thread_id ?? '') as string,
        model: 'codex',
        provider: 'codex',
      },
    }
  }

  if (data.type === 'item.completed' && data.item) {
    const item = data.item as { role?: string; content?: Array<{ type: string; text?: string }> }
    if (item.role === 'assistant' && item.content) {
      const text = item.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
      if (text) return { type: 'message', role: 'assistant', content: text }
    }
  }

  if (data.type === 'turn.completed' && data.usage) {
    const usage = data.usage as Record<string, number>
    return {
      type: 'tokens',
      metadata: {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cached: 0,
        costUsd: 0,
      },
    }
  }

  if (data.type === 'turn.failed') {
    return {
      type: 'error',
      content: (data.error ?? 'unknown error') as string,
      metadata: { code: 'turn.failed', isRateLimit: false },
    }
  }

  return { type: 'raw', content: trimmed }
}

const HTTP_429 = /(?<![=]\s{0,5})\b429\b/

const rateLimitPatterns: RegExp[] = [
  /rate_limit_exceeded/,
  /quota_exceeded/,
  HTTP_429,
]

export const codexAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/adapters-codex.test.ts`
Expected: PASS (all 10 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/adapters/codex.ts lib/__tests__/adapters-codex.test.ts
git commit -m "feat: add Codex adapter — buildArgs, parseLine, resumeArgs"
```

---

### Task 5: Ollama adapter

**Files:**
- Create: `lib/sessions/adapters/ollama.ts`
- Create: `lib/__tests__/adapters-ollama.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/adapters-ollama.test.ts
import { describe, it, expect } from 'vitest'
import { ollamaAdapter } from '@/lib/sessions/adapters/ollama'

describe('ollamaAdapter.buildArgs', () => {
  it('builds args with run subcommand', () => {
    const args = ollamaAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args[0]).toBe('run')
  })
})

describe('ollamaAdapter.resumeArgs', () => {
  it('returns empty array (no resume support)', () => {
    expect(ollamaAdapter.resumeArgs('sess-abc')).toEqual([])
  })
})

describe('ollamaAdapter.parseLine', () => {
  it('returns all lines as raw events', () => {
    const event = ollamaAdapter.parseLine('Here is your answer')
    expect(event).toEqual({ type: 'raw', content: 'Here is your answer' })
  })

  it('returns null for empty lines', () => {
    expect(ollamaAdapter.parseLine('')).toBeNull()
  })
})

describe('ollamaAdapter.rateLimitPatterns', () => {
  it('has no patterns', () => {
    expect(ollamaAdapter.rateLimitPatterns).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/adapters-ollama.test.ts`
Expected: FAIL — cannot resolve `@/lib/sessions/adapters/ollama`

- [ ] **Step 3: Implement the Ollama adapter**

```typescript
// lib/sessions/adapters/ollama.ts
import type { AdapterModule, TranscriptEvent, BuildArgsOpts } from './types'

function buildArgs(opts: BuildArgsOpts): string[] {
  // Ollama: `ollama run <model>` — model is the command itself (provider.command = 'ollama')
  // Prompt is written to stdin after spawn
  return ['run', 'llama3']
}

function resumeArgs(_sessionId: string): string[] {
  return [] // Ollama has no session resume
}

function parseLine(line: string): TranscriptEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  return { type: 'raw', content: trimmed }
}

const rateLimitPatterns: RegExp[] = []

export const ollamaAdapter: AdapterModule = { buildArgs, parseLine, resumeArgs, rateLimitPatterns }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/adapters-ollama.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/adapters/ollama.ts lib/__tests__/adapters-ollama.test.ts
git commit -m "feat: add Ollama adapter — raw passthrough, no resume"
```

---

### Task 6: DB schema — session_events table + session_log column

**Files:**
- Modify: `lib/db.ts` (add migration blocks after the skills table migration)
- Modify: `lib/db/tasks.ts` (add `session_log` to Task type)
- Create: `lib/db/sessionEvents.ts`
- Create: `lib/__tests__/sessionEvents.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/__tests__/sessionEvents.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import {
  insertSessionEvent,
  getSessionEvents,
  flushSessionEvents,
  deleteSessionEvents,
} from '@/lib/db/sessionEvents'
import type { TranscriptEvent } from '@/lib/sessions/adapters/types'
import fs from 'fs'
import path from 'path'
import os from 'os'

let db: ReturnType<typeof initDb>

beforeEach(() => {
  db = initDb(':memory:')
  // Seed a project and session for FK constraints
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run('p1', 'Test', '/tmp/test', new Date().toISOString())
  db.prepare("INSERT INTO sessions (id, project_id, label, phase, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)").run('s1', 'p1', 'test', 'develop', new Date().toISOString())
})

describe('insertSessionEvent', () => {
  it('inserts an event and assigns an auto-increment id', () => {
    const event: TranscriptEvent = { type: 'message', role: 'assistant', content: 'Hello' }
    const id = insertSessionEvent(db, 's1', event)
    expect(id).toBe(1)
  })

  it('stores metadata as JSON string', () => {
    const event: TranscriptEvent = { type: 'tokens', metadata: { input: 100, output: 50 } }
    insertSessionEvent(db, 's1', event)
    const rows = getSessionEvents(db, 's1')
    expect(JSON.parse(rows[0].metadata!)).toEqual({ input: 100, output: 50 })
  })
})

describe('getSessionEvents', () => {
  it('returns events ordered by id ascending', () => {
    insertSessionEvent(db, 's1', { type: 'init', metadata: { sessionId: 's1', model: 'test', provider: 'claude' } })
    insertSessionEvent(db, 's1', { type: 'message', role: 'assistant', content: 'Hi' })
    insertSessionEvent(db, 's1', { type: 'tokens', metadata: { input: 10, output: 5 } })
    const events = getSessionEvents(db, 's1')
    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('init')
    expect(events[1].type).toBe('message')
    expect(events[2].type).toBe('tokens')
  })

  it('returns empty array for unknown session', () => {
    expect(getSessionEvents(db, 'nope')).toEqual([])
  })
})

describe('flushSessionEvents', () => {
  it('writes events as NDJSON to the given file path', () => {
    insertSessionEvent(db, 's1', { type: 'message', role: 'assistant', content: 'Hello' })
    insertSessionEvent(db, 's1', { type: 'tokens', metadata: { input: 10, output: 5 } })

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flush-test-'))
    const filePath = path.join(tmpDir, 's1.jsonl')

    flushSessionEvents(db, 's1', filePath)

    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).type).toBe('message')
    expect(JSON.parse(lines[1]).type).toBe('tokens')

    // Events should be deleted from the table
    expect(getSessionEvents(db, 's1')).toEqual([])

    fs.rmSync(tmpDir, { recursive: true })
  })
})

describe('deleteSessionEvents', () => {
  it('deletes all events for a session', () => {
    insertSessionEvent(db, 's1', { type: 'raw', content: 'test' })
    insertSessionEvent(db, 's1', { type: 'raw', content: 'test2' })
    deleteSessionEvents(db, 's1')
    expect(getSessionEvents(db, 's1')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/sessionEvents.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/sessionEvents`

- [ ] **Step 3: Add session_events table migration to db.ts**

Add the following after the skills table migration block in `lib/db.ts` (after the `UNIQUE(project_id, key)` block around line 265):

```typescript
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      type       TEXT NOT NULL,
      role       TEXT,
      content    TEXT,
      metadata   TEXT,
      created_at TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN session_log TEXT') } catch {}
```

- [ ] **Step 4: Add session_log to Task type in lib/db/tasks.ts**

In `lib/db/tasks.ts`, add `session_log: string | null` to the `Task` type after `provider_id`:

```typescript
export type Task = {
  id: string
  project_id: string
  title: string
  status: TaskStatus
  idea_file: string | null
  spec_file: string | null
  plan_file: string | null
  dev_summary: string | null
  commit_refs: string | null
  doc_refs: string | null
  notes: string | null
  priority: TaskPriority
  labels: string | null
  assignee_agent_id: string | null
  provider_id: string | null
  session_log: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Create lib/db/sessionEvents.ts**

```typescript
// lib/db/sessionEvents.ts
import type { Database } from 'better-sqlite3'
import type { TranscriptEvent } from '@/lib/sessions/adapters/types'
import fs from 'fs'
import path from 'path'

export type SessionEventRow = {
  id: number
  session_id: string
  type: string
  role: string | null
  content: string | null
  metadata: string | null
  created_at: string
}

export function insertSessionEvent(db: Database, sessionId: string, event: TranscriptEvent): number {
  const result = db.prepare(
    'INSERT INTO session_events (session_id, type, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId,
    event.type,
    event.role ?? null,
    event.content ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    new Date().toISOString(),
  )
  return result.lastInsertRowid as number
}

export function getSessionEvents(db: Database, sessionId: string): SessionEventRow[] {
  return db.prepare('SELECT * FROM session_events WHERE session_id = ? ORDER BY id ASC').all(sessionId) as SessionEventRow[]
}

export function deleteSessionEvents(db: Database, sessionId: string): void {
  db.prepare('DELETE FROM session_events WHERE session_id = ?').run(sessionId)
}

export function flushSessionEvents(db: Database, sessionId: string, filePath: string): void {
  const events = getSessionEvents(db, sessionId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const ndjson = events.map(e => JSON.stringify({
    type: e.type,
    role: e.role,
    content: e.content,
    metadata: e.metadata ? JSON.parse(e.metadata) : null,
    created_at: e.created_at,
  })).join('\n')
  fs.writeFileSync(filePath, ndjson + '\n', 'utf8')
  deleteSessionEvents(db, sessionId)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/sessionEvents.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 7: Commit**

```bash
git add lib/db.ts lib/db/tasks.ts lib/db/sessionEvents.ts lib/__tests__/sessionEvents.test.ts
git commit -m "feat: add session_events table, CRUD module, session_log column on tasks"
```

---

### Task 7: Rewrite session-manager — pipe-based spawning

**Files:**
- Modify: `lib/session-manager.ts` (full rewrite of spawn + WebSocket)
- Modify: `lib/prompts.ts` (buildArgs delegates to adapter)
- Modify: `server.ts` (shutdown uses ChildProcess.kill)
- Modify: `lib/__tests__/session-manager-provider.test.ts` (remove node-pty mock)

This is the largest task. The session-manager goes from PTY to `child_process.spawn`. The WebSocket handler replays from the `session_events` table instead of the rolling buffer. The `buildArgs` function in prompts.ts delegates to the adapter.

- [ ] **Step 1: Update buildArgs in lib/prompts.ts**

Replace the existing `buildArgs` function (around line 110-125) with:

```typescript
import { getAdapter } from './sessions/adapters'
import type { ProviderType } from './db/providers'

export function buildArgs(opts: {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
  providerType: ProviderType
}): string[] {
  const adapter = getAdapter(opts.providerType)
  return adapter.buildArgs({
    systemPrompt: opts.systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId: opts.sessionId,
  })
}
```

- [ ] **Step 2: Rewrite lib/session-manager.ts**

Replace the entire file with:

```typescript
// lib/session-manager.ts
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { WebSocket } from 'ws'
import fs from 'fs'
import { EventEmitter } from 'events'
import { getDb, createSession, endSession, getActiveSessionForFile, getProject, listContextPacks } from './db'
import { logEvent } from './events'
import { buildArgs, buildSessionContext, Phase, PermissionMode } from './prompts'
import { getTask, updateTask } from './db/tasks'
import { getAgent, updateAgent } from './db/agents'
import { writeInstructions, deleteInstructions } from './agents/writeInstructions'
import { getSkillsByProject } from './db/skills'
import { buildTaskContext } from './prompts'
import { getGitHistory } from './git'
import path from 'path'
import { randomUUID } from 'crypto'
import { writeFrontmatter } from './frontmatter'
import { resolveProvider } from './sessions/resolveProvider'
import { getActiveProviders } from './db/providers'
import { getAdapter } from './sessions/adapters'
import { insertSessionEvent, getSessionEvents, flushSessionEvents } from './db/sessionEvents'

// --- Process maps (survive Next.js hot-reload via globalThis) ---
declare global {
  var procMap: Map<string, ChildProcess>
  var wsMap: Map<string, Set<WebSocket>>
}
globalThis.procMap ??= new Map()
globalThis.wsMap ??= new Map()

// Per-project event emitter for orchestrator wake-up
declare global {
  var projectEmitters: Map<string, EventEmitter>
}
globalThis.projectEmitters ??= new Map()

export function getProjectEmitter(projectPath: string): EventEmitter {
  if (!globalThis.projectEmitters.has(projectPath)) {
    globalThis.projectEmitters.set(projectPath, new EventEmitter())
  }
  return globalThis.projectEmitters.get(projectPath)!
}

export function emitSessionEnded(projectId: string, payload: { session_id: string; source_file: string | null; exit_reason: string }): void {
  const project = getProject(getDb(), projectId)
  if (project) {
    getProjectEmitter(project.path).emit('session-ended', payload)
  }
}

export const procMap = globalThis.procMap
export const wsMap = globalThis.wsMap

// --- Session spawning ---
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
  correctionNote?: string
  taskId?: string
  outputPath?: string
  agentId?: string
}

export function isClaudeAvailable(): boolean {
  return getActiveProviders(getDb()).length > 0
}

export function spawnSession(opts: SpawnOptions): string {
  const db = getDb()
  const provider = resolveProvider(db, {
    projectId: opts.projectId,
    taskId: opts.taskId,
    agentId: opts.agentId,
  })
  const sessionId = randomUUID()

  if (opts.agentId) {
    const agent = getAgent(db, opts.agentId)
    if (agent) {
      const project = getProject(db, opts.projectId)
      if (project) {
        try {
          writeInstructions(agent, project, provider.type)
        } catch (err) {
          console.warn('Agent provider resolution failed:', err)
        }
        updateAgent(db, opts.agentId, { status: 'running' })
      }
    }
  }

  // Block concurrent sessions on the same file
  if (opts.sourceFile) {
    const canonical = fs.realpathSync(opts.sourceFile)
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  const contextPacks = listContextPacks(db, opts.projectId).map(p => ({ title: p.title, content: p.content }))

  // Assemble task context if taskId is provided
  let fullContext = opts.userContext
  if (opts.taskId) {
    const task = getTask(db, opts.taskId)
    if (task) {
      let taskBlock = buildTaskContext(task)
      if (opts.outputPath) {
        taskBlock += `\n\n## Output Path\nWrite your output to: ${opts.outputPath}`
      }
      if (taskBlock) {
        fullContext = `${taskBlock}\n\n---\n\n${opts.userContext}`
      }
    }
  }

  let systemPrompt = buildSessionContext({
    phase: opts.phase,
    sourceFile: opts.sourceFile,
    userContext: fullContext,
    gitHistory: getGitHistory(opts.projectPath),
    correctionNote: opts.correctionNote,
    contextPacks: contextPacks.length > 0 ? contextPacks : null,
  })

  // Inject project skills into system prompt
  const projectSkills = getSkillsByProject(db, opts.projectId)
  if (projectSkills.length > 0) {
    const skillsProject = getProject(db, opts.projectId)
    if (skillsProject) {
      const skillsContent = projectSkills
        .map(s => {
          try {
            const content = fs.readFileSync(path.join(skillsProject.path, s.file_path), 'utf8')
            return `## Skill: ${s.name}\n\n${content}`
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .join('\n\n---\n\n')
      if (skillsContent) {
        systemPrompt += `\n\n---\n\n# Project Skills\n\n${skillsContent}`
      }
    }
  }

  const args = buildArgs({
    systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId,
    providerType: provider.type,
  })

  const proc = spawn(provider.command, args, {
    cwd: opts.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const canonical = opts.sourceFile ? fs.realpathSync(opts.sourceFile) : null
  try {
    createSession(db, {
      id: sessionId,
      projectId: opts.projectId,
      label: opts.label,
      phase: opts.phase as import('./db').SessionPhase,
      sourceFile: canonical,
      taskId: opts.taskId,
      outputPath: opts.outputPath,
      agentId: opts.agentId,
    })
    logEvent(db, {
      projectId: opts.projectId,
      type: 'session_started',
      summary: `Started ${opts.phase} session: ${opts.label}`,
      severity: 'info',
    })
  } catch (err) {
    try { proc.kill() } catch {}
    throw err
  }

  // Write session_id into source file frontmatter
  if (opts.sourceFile && (opts.phase as string) !== 'orchestrator') {
    try {
      const content = fs.readFileSync(opts.sourceFile, 'utf8')
      const updated = writeFrontmatter(content, { [`${opts.phase}_session_id`]: sessionId })
      fs.writeFileSync(opts.sourceFile, updated, 'utf8')
    } catch {}
  }

  const adapter = getAdapter(provider.type)

  procMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())

  // Read stdout line-by-line
  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      // Parse structured event
      const event = adapter.parseLine(line)
      if (event) {
        insertSessionEvent(db, sessionId, event)
        broadcast(sessionId, { type: 'event', event })
      }
      // Always broadcast raw output for terminal view
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  // Capture stderr for rate limit detection
  if (proc.stderr) {
    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      const isRateLimit = adapter.rateLimitPatterns.some(p => p.test(line))
      if (isRateLimit) {
        db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId)
        insertSessionEvent(db, sessionId, {
          type: 'error',
          content: line,
          metadata: { code: 'rate_limit', isRateLimit: true },
        })
        broadcast(sessionId, { type: 'rate_limit', provider: provider.name })
      }
      // Also broadcast stderr as output
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  proc.on('close', () => {
    endSession(getDb(), sessionId)
    if (opts.agentId) {
      const project = getProject(getDb(), opts.projectId)
      if (project) {
        deleteInstructions(project, provider.type)
      }
      updateAgent(getDb(), opts.agentId, { status: 'idle' })
    }
    // Write artifact refs back to task on session end
    if (opts.taskId) {
      const phaseToField: Record<string, 'idea_file' | 'spec_file' | 'plan_file'> = {
        ideate:     'idea_file',
        brainstorm: 'idea_file',
        spec:       'spec_file',
        plan:       'plan_file',
      }
      const field = phaseToField[opts.phase]
      if (field && opts.outputPath) {
        if (fs.existsSync(opts.outputPath)) {
          updateTask(getDb(), opts.taskId, { [field]: opts.outputPath })
        }
      }
      // Flush session events to log file
      const logDir = path.join(process.cwd(), 'data', 'sessions')
      const logPath = path.join(logDir, `${sessionId}.jsonl`)
      try {
        flushSessionEvents(getDb(), sessionId, logPath)
        updateTask(getDb(), opts.taskId, { session_log: logPath })
      } catch {}
    }
    logEvent(getDb(), {
      projectId: opts.projectId,
      type: 'session_ended',
      summary: `${opts.phase} session ended: ${opts.label}`,
      severity: 'info',
    })
    emitSessionEnded(opts.projectId, { session_id: sessionId, source_file: opts.sourceFile, exit_reason: 'completed' })

    procMap.delete(sessionId)
    broadcast(sessionId, { type: 'status', state: 'ended' })
    wsMap.delete(sessionId)
  })

  return sessionId
}

export function killSession(sessionId: string): void {
  const proc = procMap.get(sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    procMap.delete(sessionId)
  }
  endSession(getDb(), sessionId)
  wsMap.delete(sessionId)
}

export function isAlive(sessionId: string): boolean {
  return procMap.has(sessionId)
}

// --- Broadcast helper ---
function broadcast(sessionId: string, msg: Record<string, unknown>): void {
  const clients = wsMap.get(sessionId) ?? new Set()
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json)
    }
  }
}

// --- WebSocket handler ---
export function handleWebSocket(ws: WebSocket): void {
  let attachedSessionId: string | null = null

  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'attach') {
      const { sessionId } = msg
      attachedSessionId = sessionId

      // Replay events from session_events table
      const events = getSessionEvents(getDb(), sessionId)
      for (const event of events) {
        ws.send(JSON.stringify({
          type: 'event',
          event: {
            id: event.id,
            type: event.type,
            role: event.role,
            content: event.content,
            metadata: event.metadata ? JSON.parse(event.metadata) : null,
            created_at: event.created_at,
          },
        }))
      }

      // Register client
      if (!wsMap.has(sessionId)) wsMap.set(sessionId, new Set())
      wsMap.get(sessionId)!.add(ws)

      // Send current status
      const alive = procMap.has(sessionId)
      ws.send(JSON.stringify({ type: 'status', state: alive ? 'active' : 'ended' }))
    }

    if (msg.type === 'input' && attachedSessionId) {
      const proc = procMap.get(attachedSessionId)
      if (proc?.stdin?.writable) {
        proc.stdin.write(msg.data + '\n')
      }
    }
  })

  ws.on('close', () => {
    if (attachedSessionId) {
      wsMap.get(attachedSessionId)?.delete(ws)
    }
  })
}

// --- Orchestrator session spawning ---

const ORCHESTRATOR_CLAUDE_MD = (mcpPort: number, secret: string, projectPath: string) => `# Orchestrator Session

You are the orchestrator for the project at \`${projectPath}\`.

## Role
Watch sessions. Drive the Ideas→Specs→Plans→Developing pipeline. Surface commentary and proposed actions. You do NOT write code.

## MCP Server
Connect to http://localhost:${mcpPort}/mcp with header \`X-Orchestrator-Secret: ${secret}\`.

Tools: list_sessions, read_artifact, read_progress, spawn_session, advance_phase, pause_session, propose_actions, log_decision, notify

## Automation Levels
- \`manual\`: take no action — user controls all transitions
- \`checkpoint\`: pause at every gate for approval
- \`auto\`: advance automatically unless a risk flag is detected

## Risk Heuristics (always gate regardless of automation level)
- Content mentions database migration
- Content mentions auth, tokens, credentials
- Content mentions breaking changes or API contract changes
- Test suite failure detected

## Decision Loop
When a session exits: read its artifacts → evaluate risk → call \`advance_phase\` or \`pause_session(reason)\` + \`propose_actions\`. Always call \`log_decision\` after every action.
`.trim()

export function spawnOrchestratorSession(opts: {
  orchestratorId: string
  projectId: string
  projectPath: string
}): string {
  const sessionId = randomUUID()
  const db = getDb()
  const provider = resolveProvider(db, { projectId: opts.projectId })

  const mcpPort = parseInt(process.env.ORCHESTRATOR_MCP_PORT ?? '3002', 10)
  let secret: string
  try {
    const { getMcpSecret } = require('../server/orchestrator-mcp')
    secret = getMcpSecret()
  } catch {
    secret = process.env.ORCHESTRATOR_MCP_SECRET ?? opts.orchestratorId
  }

  const systemPrompt = ORCHESTRATOR_CLAUDE_MD(mcpPort, secret, opts.projectPath)

  const args = buildArgs({
    systemPrompt,
    userContext: 'Start your orchestrator loop. List sessions and monitor.',
    permissionMode: 'default',
    sessionId,
    providerType: provider.type,
  })

  const proc = spawn(provider.command, args, {
    cwd: opts.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  createSession(db, {
    id: sessionId,
    projectId: opts.projectId,
    label: 'Orchestrator',
    phase: 'orchestrator',
    sourceFile: null,
  })

  const adapter = getAdapter(provider.type)

  procMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())

  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const event = adapter.parseLine(line)
      if (event) {
        insertSessionEvent(db, sessionId, event)
        broadcast(sessionId, { type: 'event', event })
      }
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  if (proc.stderr) {
    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      const isRateLimit = adapter.rateLimitPatterns.some(p => p.test(line))
      if (isRateLimit) {
        db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId)
        broadcast(sessionId, { type: 'rate_limit', provider: provider.name })
      }
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  proc.on('close', () => {
    endSession(db, sessionId)
    procMap.delete(sessionId)
    broadcast(sessionId, { type: 'status', state: 'ended' })
    wsMap.delete(sessionId)
  })

  return sessionId
}
```

- [ ] **Step 3: Update server.ts shutdown handler**

In `server.ts`, change the import and shutdown handler. Replace:

```typescript
import { handleWebSocket, ptyMap } from './lib/session-manager'
```

with:

```typescript
import { handleWebSocket, procMap } from './lib/session-manager'
```

Replace the shutdown handler:

```typescript
  const shutdown = () => {
    for (const proc of (procMap as Map<string, any>).values()) {
      try { proc.kill() } catch {}
    }
    process.exit(0)
  }
```

- [ ] **Step 4: Update the provider test to remove node-pty mock**

Replace `lib/__tests__/session-manager-provider.test.ts` entirely:

```typescript
// lib/__tests__/session-manager-provider.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', () => ({
  spawn: vi.fn(() => {
    const { EventEmitter } = require('events')
    const proc = new EventEmitter()
    proc.stdin = { writable: true, write: vi.fn() }
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.kill = vi.fn()
    // Simulate readable streams for createInterface
    proc.stdout.on = vi.fn()
    proc.stderr.on = vi.fn()
    return proc
  }),
}))

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run('proj-test', 'Test', '/tmp/test', new Date().toISOString())
  return {
    ...actual,
    getDb: () => db,
    createSession: vi.fn(),
    endSession: vi.fn(),
    getActiveSessionForFile: vi.fn(() => undefined),
    getProject: vi.fn(() => ({ path: '/tmp/test' })),
    listContextPacks: vi.fn(() => []),
  }
})

vi.mock('@/lib/events', () => ({ logEvent: vi.fn() }))
vi.mock('@/lib/prompts', () => ({
  buildArgs: vi.fn(() => []),
  buildSessionContext: vi.fn(() => ''),
  buildTaskContext: vi.fn(() => ''),
}))
vi.mock('@/lib/db/tasks', () => ({ getTask: vi.fn(() => undefined), updateTask: vi.fn() }))
vi.mock('@/lib/git', () => ({ getGitHistory: vi.fn(() => '') }))
vi.mock('@/lib/frontmatter', () => ({ writeFrontmatter: vi.fn((c: string) => c) }))
vi.mock('@/lib/db/sessionEvents', () => ({
  insertSessionEvent: vi.fn(),
  getSessionEvents: vi.fn(() => []),
  flushSessionEvents: vi.fn(),
}))

import { spawnSession } from '@/lib/session-manager'

describe('spawnSession provider resolution', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers are configured', () => {
    expect(() => spawnSession({
      projectId: 'proj-test', projectPath: '/tmp/test', label: 'test',
      phase: 'develop', sourceFile: null, userContext: '', permissionMode: 'default',
    })).toThrow('NO_PROVIDERS_CONFIGURED')
  })
})
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. The session-manager-provider test still passes. The adapter tests pass. The rateLimitDetector test will fail because we haven't deleted it yet — that's fine for now.

- [ ] **Step 6: Commit**

```bash
git add lib/session-manager.ts lib/prompts.ts server.ts lib/__tests__/session-manager-provider.test.ts
git commit -m "feat: rewrite session-manager — pipe-based spawn, adapter parsing, events table"
```

---

### Task 8: Remove node-pty, rateLimitDetector, and debrief

**Files:**
- Delete: `lib/sessions/rateLimitDetector.ts`
- Delete: `lib/__tests__/rateLimitDetector.test.ts`
- Delete: `lib/debrief.ts`
- Modify: `package.json` (remove `node-pty`)

- [ ] **Step 1: Delete the files**

```bash
rm lib/sessions/rateLimitDetector.ts
rm lib/__tests__/rateLimitDetector.test.ts
rm lib/debrief.ts
```

- [ ] **Step 2: Remove node-pty from package.json**

```bash
npm uninstall node-pty
```

- [ ] **Step 3: Verify no remaining imports of deleted modules**

Run: `grep -r 'rateLimitDetector\|node-pty\|debrief' lib/ server.ts --include='*.ts' --include='*.tsx'`
Expected: No matches (the session-manager rewrite already removed these imports)

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. The deleted test file is gone. No import errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove node-pty, rateLimitDetector, debrief — replaced by adapters + events"
```

---

### Task 9: SessionInput component

**Files:**
- Create: `components/tasks/SessionInput.tsx`
- Create: `components/__tests__/SessionInput.test.tsx`
- Modify: `components/tasks/LiveRunsSection.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// components/__tests__/SessionInput.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionInput } from '@/components/tasks/SessionInput'

describe('SessionInput', () => {
  it('renders input and send button', () => {
    render(<SessionInput onSend={vi.fn()} disabled={false} />)
    expect(screen.getByPlaceholderText(/send input/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('calls onSend with input value and clears on submit', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello world')
    expect(input).toHaveValue('')
  })

  it('submits on Enter key', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('test')
  })

  it('does not submit on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not submit empty input', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input and button when disabled prop is true', () => {
    render(<SessionInput onSend={vi.fn()} disabled={true} />)
    expect(screen.getByPlaceholderText(/no active session/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/__tests__/SessionInput.test.tsx`
Expected: FAIL — cannot resolve `@/components/tasks/SessionInput`

- [ ] **Step 3: Implement SessionInput component**

```typescript
// components/tasks/SessionInput.tsx
'use client'
import { useState } from 'react'

type Props = {
  onSend: (text: string) => void
  disabled: boolean
}

export function SessionInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'No active session' : 'Send input to session...'}
        style={{
          flex: 1,
          background: '#0a0c0e',
          border: '1px solid #1c1f22',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#c8d0da',
          fontSize: 12,
          fontFamily: 'monospace',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled}
        aria-label="Send"
        style={{
          background: disabled ? '#1c1f22' : '#2563eb',
          color: disabled ? '#454c54' : '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 14px',
          fontSize: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        Send
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/__tests__/SessionInput.test.tsx`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Wire SessionInput into LiveRunsSection**

In `components/tasks/LiveRunsSection.tsx`, add the import at the top:

```typescript
import { SessionInput } from './SessionInput'
```

Add a `wsRef` to hold the WebSocket reference. After the existing `const { openWindow } = useSessionWindows()` line (around line 49), add:

```typescript
const wsRef = useRef<WebSocket | null>(null)
```

In the existing WebSocket useEffect (around line 62), store the WebSocket in the ref:

```typescript
  useEffect(() => {
    if (!activeSession?.id) return
    const ws = new WebSocket(`ws://${window.location.host}/api/sessions/${activeSession.id}/ws`)
    wsRef.current = ws
    // ... rest of existing handler unchanged ...
    return () => { ws.close(); wsRef.current = null }
  }, [activeSession?.id])
```

Add the send handler after the existing `handleOpenTerminal` function (around line 136):

```typescript
  function handleSendInput(text: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
    }
  }
```

Add the `SessionInput` component at the bottom of the return JSX, after the action buttons div (after the closing `</div>` of the flex gap 6 div, around line 189):

```tsx
      <SessionInput onSend={handleSendInput} disabled={!activeSession} />
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. The LiveRunsSection tests still pass (input bar is not tested there — it has its own test file).

- [ ] **Step 7: Commit**

```bash
git add components/tasks/SessionInput.tsx components/__tests__/SessionInput.test.tsx components/tasks/LiveRunsSection.tsx
git commit -m "feat: add SessionInput component below terminal output on task page"
```

---

### Task 10: Update LiveRunsSection WebSocket to handle new protocol

**Files:**
- Modify: `components/tasks/LiveRunsSection.tsx`
- Modify: `components/__tests__/LiveRunsSection.test.tsx`

The LiveRunsSection currently connects directly to `ws://.../api/sessions/${id}/ws` and receives plain text. The new protocol sends JSON messages with `type: 'output'`, `type: 'event'`, `type: 'status'`. The component needs to parse these properly.

- [ ] **Step 1: Update the WebSocket message handler in LiveRunsSection**

In the `useEffect` that opens the WebSocket (around line 62), replace the `ws.onmessage` handler:

```typescript
    ws.onmessage = (e: MessageEvent) => {
      const text: string = typeof e.data === 'string' ? e.data : ''

      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        // Non-JSON — treat as raw output
        const newLine: LogLine = { id: ++lineCounter.current, text }
        setLogLines((prev) => [...prev.slice(-499), newLine])
        return
      }

      if (parsed?.type === 'status' && parsed?.state === 'ended') {
        setActiveSession(null)
        onTodosRef.current([])
        return
      }

      if (parsed?.type === 'output') {
        const lineText = parsed.data ?? ''
        // Try TodoWrite match on output lines
        const todoMatch = lineText.match(/^TodoWrite\s+·\s+(\[.+\])/s)
        if (todoMatch) {
          try {
            const todos: Todo[] = JSON.parse(todoMatch[1])
            onTodosRef.current(todos)
          } catch {}
        }
        const newLine: LogLine = { id: ++lineCounter.current, text: lineText }
        setLogLines((prev) => [...prev.slice(-499), newLine])
        return
      }

      // Ignore 'event' and 'rate_limit' messages for now — output covers display
    }
```

- [ ] **Step 2: Update the WebSocket connection to send attach message**

After creating the WebSocket, send an attach message:

```typescript
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'attach', sessionId: activeSession.id }))
    }
```

Also update the WebSocket URL to use `/ws` instead of `/api/sessions/${id}/ws` since the server handles all WebSocket connections on `/ws`:

```typescript
    const ws = new WebSocket(`ws://${window.location.host}/ws`)
```

- [ ] **Step 3: Update LiveRunsSection tests**

Replace `components/__tests__/LiveRunsSection.test.tsx`:

```typescript
// components/__tests__/LiveRunsSection.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { LiveRunsSection } from '@/components/tasks/LiveRunsSection'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

global.fetch = vi.fn()

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1 // OPEN
  close = vi.fn()
  send = vi.fn()
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    // Trigger onopen asynchronously
    setTimeout(() => this.onopen?.(), 0)
  }
  emit(data: string) { this.onmessage?.({ data } as MessageEvent) }
}
vi.stubGlobal('WebSocket', MockWebSocket)

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionWindowProvider>{children}</SessionWindowProvider>
}

const mockSession = {
  id: 'sess-1', project_id: 'proj-1', task_id: 'task-1',
  label: 'Auth redesign', phase: 'brainstorm', status: 'active',
  created_at: '2026-04-01T10:00:00Z', ended_at: null,
}

describe('LiveRunsSection — inactive state', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)
  })

  it('shows "No active run" when no active session', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/no active run/i)).toBeInTheDocument())
  })

  it('does not open a WebSocket when no active session', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => screen.getByText(/no active run/i))
    expect(MockWebSocket.instances).toHaveLength(0)
  })
})

describe('LiveRunsSection — active state', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [mockSession] } as Response)
  })

  it('shows session label and phase badge when active', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/auth redesign/i)).toBeInTheDocument())
    expect(screen.getByText(/brainstorm/i)).toBeInTheDocument()
  })

  it('opens a WebSocket and sends attach message', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].url).toContain('/ws')
    await waitFor(() => {
      expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'attach', sessionId: 'sess-1' })
      )
    })
  })

  it('appends terminal output from JSON output messages', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: 'Bash · npm test' })) })
    expect(screen.getByText(/npm test/i)).toBeInTheDocument()
  })

  it('parses TodoWrite messages from output events', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const todos = [{ id: '1', content: 'Write tests', status: 'pending' }]
    act(() => {
      MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: `TodoWrite · ${JSON.stringify(todos)}` }))
    })
    expect(onTodos).toHaveBeenCalledWith(todos)
  })

  it('resets todos to [] when session ends via status message', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit(JSON.stringify({ type: 'status', state: 'ended' })) })
    expect(onTodos).toHaveBeenLastCalledWith([])
  })

  it('renders Stop, Open Terminal, and input bar', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /open terminal/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/send input/i)).toBeInTheDocument()
  })

  it('calls DELETE /api/sessions/{id} when Stop clicked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [mockSession] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => screen.getByRole('button', { name: /stop/i }))
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
    })
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/tasks/LiveRunsSection.tsx components/__tests__/LiveRunsSection.test.tsx
git commit -m "feat: update LiveRunsSection WebSocket to new JSON protocol with attach"
```

---

## Self-Review

**1. Spec coverage:**
- Section 1 (Adapter Layer) → Tasks 1-5
- Section 2 (Session Spawning) → Task 7
- Section 3 (Session Events Table) → Task 6
- Section 4 (WebSocket Protocol) → Tasks 7 and 10
- Section 5 (Task Page Input Bar) → Task 9
- Section 6 (Migration) → Tasks 7 and 8

**2. Placeholder scan:** No TBD, TODO, or vague steps. All code blocks are complete.

**3. Type consistency:**
- `TranscriptEvent` defined in Task 1, used in Tasks 2-7 — consistent
- `AdapterModule` defined in Task 1, implemented in Tasks 2-5 — consistent
- `BuildArgsOpts` defined in Task 1, used in `buildArgs` signatures — consistent
- `SessionEventRow` defined in Task 6, returned by `getSessionEvents` — consistent
- `insertSessionEvent` / `getSessionEvents` / `flushSessionEvents` defined in Task 6, imported in Task 7 — consistent
- `procMap` replaces `ptyMap` in Task 7, updated in `server.ts` in Task 7 — consistent
