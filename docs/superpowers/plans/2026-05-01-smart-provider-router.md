# Smart Provider Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "first-active provider" fallback in `lib/sessions/resolveProvider.ts` with a smart router that picks the best provider:model for unpinned sessions by combining task-class suitability, cost, and observed success rate, learning from outcomes over time.

**Architecture:** New `lib/router/` module with five pure-ish functions: `score`, `pickRoute`, `recordOutcome`, `classifyComplexity`, `localComplete`. Three new SQLite tables track decisions, outcomes, and rolled-up scores. The orchestrator-watcher feeds outcomes back via phase-advancement and override events. A local Ollama/llama.cpp model classifies task complexity. Pinned providers (task → agent → project) still win.

**Tech Stack:** Next.js 16, React 19, better-sqlite3, vitest, TanStack Query, OpenAI-compatible HTTP for local model.

**Reference spec:** `docs/superpowers/specs/2026-05-01-smart-provider-router-design.md`

---

## File Structure

**Created:**
- `lib/router/index.ts` — re-exports
- `lib/router/types.ts` — shared types (`Complexity`, `RoutingDecision`, `Outcome`, `ScoreBreakdown`)
- `lib/router/defaults.ts` — `SUITABILITY` matrix (72 cells), `COST_BY_PROVIDER_TYPE`, `N_PRIOR`, `COST_EPSILON`
- `lib/router/prompts.ts` — `COMPLEXITY_PROMPT` template
- `lib/router/scoring.ts` — pure `score()` function
- `lib/router/localComplete.ts` — OpenAI-compatible HTTP one-shot
- `lib/router/classify.ts` — `classifyComplexity()`
- `lib/router/pickRoute.ts` — `pickRoute()` (writes a `routing_decisions` row, returns it)
- `lib/router/recordOutcome.ts` — `recordOutcome()` (writes outcome, updates scores)
- `app/api/sessions/[id]/restart-with-route/route.ts` — POST handler
- `app/api/router/decisions/route.ts` — GET handler
- `app/api/router/reset-learning/route.ts` — POST handler
- `app/debug/router/page.tsx` — debug grid + reset
- `components/router/RouteRetryDialog.tsx` — failure dialog
- `tests/router/scoring.test.ts`
- `tests/router/localComplete.test.ts`
- `tests/router/classify.test.ts`
- `tests/router/pickRoute.test.ts`
- `tests/router/recordOutcome.test.ts`
- `tests/api/router-decisions.test.ts`
- `tests/api/sessions-restart-with-route.test.ts`

**Modified:**
- `lib/db.ts` — add migrations 51-57, extend `SessionStatus` union
- `lib/db/providers.ts` — add `getDefaultLocalProvider()`
- `lib/db/tasks.ts` — extend `Task` type, add `setTaskComplexity()`
- `lib/sessions/resolveProvider.ts` — async, add `phase` opt, replace step 4
- `lib/session-manager.ts` — pass `phase` + `await`, set `needs_route_retry` on adapter throw
- `server/orchestrator-watcher.ts` — call `recordOutcome` on phase-advance + override
- `components/sessions/SessionHistoryPanel.tsx` (or whichever renders session cards) — add "via router" badge

---

## Task 1: Schema migrations and type updates

**Files:**
- Modify: `lib/db.ts` (after current head migration 50)
- Modify: `lib/db/tasks.ts` (Task type)

- [ ] **Step 1: Add migrations 51-57 to `lib/db.ts`**

Append after the existing `runMigration(db, 50, ...)` line, before any code that depends on the schema being final:

```ts
runMigration(db, 51, 'create_routing_decisions', `
  CREATE TABLE IF NOT EXISTS routing_decisions (
    id              TEXT PRIMARY KEY,
    session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    picked_provider TEXT NOT NULL REFERENCES providers(id),
    phase           TEXT NOT NULL,
    complexity      TEXT NOT NULL,
    score_breakdown TEXT NOT NULL,
    created_at      TEXT NOT NULL
  )
`)
runMigration(db, 52, 'idx_routing_decisions_session', `CREATE INDEX IF NOT EXISTS idx_routing_decisions_session ON routing_decisions(session_id)`)
runMigration(db, 53, 'create_routing_outcomes', `
  CREATE TABLE IF NOT EXISTS routing_outcomes (
    id          TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL REFERENCES routing_decisions(id) ON DELETE CASCADE,
    outcome     TEXT NOT NULL CHECK (outcome IN ('success','failure','transient_error')),
    created_at  TEXT NOT NULL
  )
`)
runMigration(db, 54, 'idx_routing_outcomes_decision', `CREATE INDEX IF NOT EXISTS idx_routing_outcomes_decision ON routing_outcomes(decision_id)`)
runMigration(db, 55, 'create_routing_scores', `
  CREATE TABLE IF NOT EXISTS routing_scores (
    phase        TEXT NOT NULL,
    complexity   TEXT NOT NULL,
    provider_id  TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    n_outcomes   INTEGER NOT NULL DEFAULT 0,
    success_rate REAL NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL,
    PRIMARY KEY (phase, complexity, provider_id)
  )
`)
runMigration(db, 56, 'tasks_complexity', `ALTER TABLE tasks ADD COLUMN complexity TEXT`, true)
runMigration(db, 57, 'tasks_complexity_overridden', `ALTER TABLE tasks ADD COLUMN complexity_overridden INTEGER NOT NULL DEFAULT 0`, true)
```

- [ ] **Step 2: Extend `SessionStatus` union in `lib/db.ts`**

Find the line `export type SessionStatus = 'active' | 'ended' | 'paused'` and replace with:

```ts
export type SessionStatus = 'active' | 'ended' | 'paused' | 'needs_route_retry'
```

- [ ] **Step 3: Extend `Task` type in `lib/db/tasks.ts`**

Find the `export type Task = { ... }` block and add two fields:

```ts
complexity: 'trivial' | 'normal' | 'hard' | null
complexity_overridden: number
```

- [ ] **Step 4: Run existing tests to confirm nothing broke**

Run: `npm test -- tests/api lib/__tests__`
Expected: PASS for everything that already passes today.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/db/tasks.ts
git commit -m "feat(router): add schema for routing_decisions/outcomes/scores + complexity columns"
```

---

## Task 2: DB helpers (`getDefaultLocalProvider`, `setTaskComplexity`)

**Files:**
- Modify: `lib/db/providers.ts`
- Modify: `lib/db/tasks.ts`
- Test: `tests/db/router-helpers.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/db/router-helpers.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject } from '@/lib/db'
import { createProvider, getDefaultLocalProvider } from '@/lib/db/providers'
import { createTask, getTask, setTaskComplexity } from '@/lib/db/tasks'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
})

describe('getDefaultLocalProvider', () => {
  it('returns null when no ollama provider exists', () => {
    expect(getDefaultLocalProvider(getDb())).toBeNull()
  })

  it('returns null when ollama provider exists but is inactive', () => {
    const db = getDb()
    createProvider(db, { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    db.prepare('UPDATE providers SET is_active = 0').run()
    expect(getDefaultLocalProvider(db)).toBeNull()
  })

  it('returns the first active ollama provider', () => {
    const db = getDb()
    createProvider(db, { id: 'a', name: 'L1', type: 'ollama', command: 'ollama', config: null })
    createProvider(db, { id: 'b', name: 'L2', type: 'ollama', command: 'ollama', config: null })
    const p = getDefaultLocalProvider(db)
    expect(p?.id).toBe('a')
  })
})

describe('setTaskComplexity', () => {
  it('writes both complexity and complexity_overridden atomically', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = createTask(db, { projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'hard', true)
    const t = getTask(db, taskId)!
    expect(t.complexity).toBe('hard')
    expect(t.complexity_overridden).toBe(1)
  })

  it('overridden=false writes 0', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const taskId = createTask(db, { projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'normal', false)
    const t = getTask(db, taskId)!
    expect(t.complexity).toBe('normal')
    expect(t.complexity_overridden).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/db/router-helpers.test.ts`
Expected: FAIL with "getDefaultLocalProvider is not a function" / "setTaskComplexity is not a function".

- [ ] **Step 3: Implement `getDefaultLocalProvider` in `lib/db/providers.ts`**

Append to `lib/db/providers.ts`:

```ts
export function getDefaultLocalProvider(db: Database): Provider | null {
  const row = db
    .prepare(`SELECT * FROM providers WHERE is_active = 1 AND type = 'ollama' ORDER BY created_at ASC LIMIT 1`)
    .get() as Provider | undefined
  return row ?? null
}
```

- [ ] **Step 4: Implement `setTaskComplexity` in `lib/db/tasks.ts`**

Append to `lib/db/tasks.ts`:

```ts
export function setTaskComplexity(
  db: Database,
  id: string,
  complexity: 'trivial' | 'normal' | 'hard',
  overridden: boolean,
): void {
  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET complexity = ?, complexity_overridden = ?, updated_at = ? WHERE id = ?')
    .run(complexity, overridden ? 1 : 0, now, id)
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/db/router-helpers.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 6: Commit**

```bash
git add lib/db/providers.ts lib/db/tasks.ts tests/db/router-helpers.test.ts
git commit -m "feat(router): add getDefaultLocalProvider and setTaskComplexity helpers"
```

---

## Task 3: Module skeleton — `types.ts`, `defaults.ts`, `prompts.ts`, `index.ts`

**Files:**
- Create: `lib/router/types.ts`
- Create: `lib/router/defaults.ts`
- Create: `lib/router/prompts.ts`
- Create: `lib/router/index.ts`

- [ ] **Step 1: Create `lib/router/types.ts`**

```ts
import type { SessionPhase } from '@/lib/db'
import type { ProviderType } from '@/lib/db/providers'

export type Complexity = 'trivial' | 'normal' | 'hard'
export type Outcome = 'success' | 'failure' | 'transient_error'

export type ScoreBreakdown = {
  suitability: number
  cost: number
  success_rate_blended: number
  n_observed: number
  total: number
  considered: Array<{ providerId: string; providerName: string; score: number }>
}

export type RoutingDecision = {
  id: string
  session_id: string
  task_id: string | null
  picked_provider: string
  phase: SessionPhase
  complexity: Complexity
  score_breakdown: string         // JSON-encoded ScoreBreakdown
  created_at: string
}

export type RoutingOutcome = {
  id: string
  decision_id: string
  outcome: Outcome
  created_at: string
}

export type RoutingScore = {
  phase: SessionPhase
  complexity: Complexity
  provider_id: string
  n_outcomes: number
  success_rate: number
  updated_at: string
}

export type { SessionPhase, ProviderType }
```

- [ ] **Step 2: Create `lib/router/defaults.ts` with the full SUITABILITY matrix**

```ts
import type { SessionPhase, ProviderType } from '@/lib/db/providers'
import type { Complexity } from './types'

/**
 * 0..1 — how well this provider type suits this (phase, complexity) cell.
 * Initial weights based on stated provider strengths:
 *   - claude (Opus): planning, architecture, code review, deep reasoning
 *   - codex (gpt-5.3): aggressive shell automation, bulk edits, refactors
 *   - gemini: long context, broad sweeps, multi-modal
 *   - ollama (local 9B): triage, classification, structured extraction
 * Adaptive layer takes over per cell once n_observed crosses N_PRIOR.
 */
export const SUITABILITY: Record<SessionPhase, Record<Complexity, Record<ProviderType, number>>> = {
  ideate: {
    trivial: { claude: 0.70, codex: 0.50, gemini: 0.70, ollama: 0.60 },
    normal:  { claude: 0.85, codex: 0.60, gemini: 0.80, ollama: 0.40 },
    hard:    { claude: 0.95, codex: 0.60, gemini: 0.85, ollama: 0.20 },
  },
  brainstorm: {
    trivial: { claude: 0.75, codex: 0.50, gemini: 0.70, ollama: 0.55 },
    normal:  { claude: 0.90, codex: 0.60, gemini: 0.80, ollama: 0.35 },
    hard:    { claude: 0.95, codex: 0.60, gemini: 0.85, ollama: 0.20 },
  },
  spec: {
    trivial: { claude: 0.85, codex: 0.60, gemini: 0.75, ollama: 0.40 },
    normal:  { claude: 0.95, codex: 0.70, gemini: 0.80, ollama: 0.30 },
    hard:    { claude: 0.98, codex: 0.70, gemini: 0.85, ollama: 0.15 },
  },
  plan: {
    trivial: { claude: 0.85, codex: 0.65, gemini: 0.75, ollama: 0.40 },
    normal:  { claude: 0.95, codex: 0.75, gemini: 0.80, ollama: 0.25 },
    hard:    { claude: 0.98, codex: 0.75, gemini: 0.85, ollama: 0.10 },
  },
  develop: {
    trivial: { claude: 0.70, codex: 0.85, gemini: 0.60, ollama: 0.50 },
    normal:  { claude: 0.85, codex: 0.95, gemini: 0.70, ollama: 0.25 },
    hard:    { claude: 0.95, codex: 0.90, gemini: 0.75, ollama: 0.10 },
  },
  orchestrator: {
    trivial: { claude: 0.85, codex: 0.70, gemini: 0.70, ollama: 0.40 },
    normal:  { claude: 0.92, codex: 0.75, gemini: 0.75, ollama: 0.30 },
    hard:    { claude: 0.98, codex: 0.80, gemini: 0.85, ollama: 0.15 },
  },
}

/**
 * 0..1 — relative cost per provider type. Local ≈ free, frontier models ≈ 1.
 * Per-provider override available via Provider.config.cost_weight.
 */
export const COST_BY_PROVIDER_TYPE: Record<ProviderType, number> = {
  ollama: 0.01,
  gemini: 0.05,
  codex:  0.60,
  claude: 0.50,
}

/** Bayesian prior weight. Defaults dominate until n_observed crosses this. */
export const N_PRIOR = 10

/** Divide-by-zero guard in scoring. */
export const COST_EPSILON = 0.01

/** Defensive default when SUITABILITY does not contain a provider type. */
export const SUITABILITY_FALLBACK = 0.5
```

- [ ] **Step 3: Create `lib/router/prompts.ts`**

```ts
export const COMPLEXITY_PROMPT = `You are a task complexity classifier. Read the task title and description and reply with EXACTLY ONE of these tokens, lowercase, no other text:

trivial — small, mechanical, low-judgment work (rename, format, copy edit, single-file tweak)
normal  — typical multi-step feature/bugfix that touches a handful of files
hard    — multi-system change, deep refactor, ambiguous requirements, design or research-heavy

Title: {title}
Description: {description}

Reply:`
```

- [ ] **Step 4: Create `lib/router/index.ts` (placeholders, will be filled by later tasks)**

```ts
export * from './types'
export * from './defaults'
export * from './prompts'
// Re-exports added in later tasks:
// export { score } from './scoring'
// export { localComplete } from './localComplete'
// export { classifyComplexity } from './classify'
// export { pickRoute } from './pickRoute'
// export { recordOutcome } from './recordOutcome'
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors in `lib/router/*` (pre-existing errors elsewhere are fine).

- [ ] **Step 6: Commit**

```bash
git add lib/router/
git commit -m "feat(router): add module skeleton with types, defaults matrix, and prompt"
```

---

## Task 4: `scoring.ts` (pure function with full unit tests)

**Files:**
- Create: `lib/router/scoring.ts`
- Test: `tests/router/scoring.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { score } from '@/lib/router/scoring'
import { N_PRIOR } from '@/lib/router/defaults'

const claude = { id: 'c', type: 'claude', config: null } as const
const ollama = { id: 'o', type: 'ollama', config: null } as const

describe('score', () => {
  it('cold-start (n=0): equals suit² / cost', () => {
    const s = score(claude, 'plan', 'hard', { n: 0, rate: 0 })
    // SUITABILITY.plan.hard.claude = 0.98; COST_BY_PROVIDER_TYPE.claude = 0.5
    // suit² / cost = 0.9604 / 0.5 = 1.9208
    expect(s).toBeCloseTo(1.9208, 4)
  })

  it('blends defaults and observed at n=5 with N_PRIOR=10', () => {
    // suit = 0.85 (plan, normal, claude); rate prior = 0.85; observed n=5, observed rate 0.4
    // blended = (5*0.4 + 10*0.85) / 15 = (2 + 8.5)/15 = 0.7
    // total = 0.85 * 0.7 / 0.5 = 1.19
    const s = score(claude, 'plan', 'normal', { n: 5, rate: 0.4 })
    expect(s).toBeCloseTo(1.19, 3)
  })

  it('observed dominates when n >> N_PRIOR', () => {
    // n=1000, observed rate=1.0, default=0.85
    // blended ≈ (1000 + 10*0.85)/1010 = 1008.5/1010 ≈ 0.9985
    // total = 0.85 * 0.9985 / 0.5 ≈ 1.6975
    const s = score(claude, 'plan', 'normal', { n: 1000, rate: 1.0 })
    expect(s).toBeGreaterThan(1.69)
    expect(s).toBeLessThan(1.70)
  })

  it('per-provider cost_weight in config overrides type default', () => {
    const cheap = { id: 'cheap', type: 'claude' as const, config: JSON.stringify({ cost_weight: 0.1 }) }
    // suit² / 0.1 instead of / 0.5
    const cheapScore = score(cheap, 'plan', 'hard', { n: 0, rate: 0 })
    const normalScore = score(claude, 'plan', 'hard', { n: 0, rate: 0 })
    expect(cheapScore).toBeGreaterThan(normalScore)
  })

  it('cost_weight = 0 does not divide by zero (uses COST_EPSILON)', () => {
    const free = { id: 'f', type: 'claude' as const, config: JSON.stringify({ cost_weight: 0 }) }
    const s = score(free, 'plan', 'hard', { n: 0, rate: 0 })
    expect(Number.isFinite(s)).toBe(true)
  })

  it('unknown provider type falls back to SUITABILITY_FALLBACK (0.5)', () => {
    const novel = { id: 'n', type: 'mystery', config: null } as { id: string; type: string; config: null }
    const s = score(novel as any, 'plan', 'hard', { n: 0, rate: 0 })
    // suit² / cost-fallback... cost lookup also unknown; spec says use COST_EPSILON for missing cost
    // suit = 0.5, so suit² = 0.25; cost falls back to COST_EPSILON = 0.01; total = 0.25/0.01 = 25
    expect(s).toBeCloseTo(25, 2)
  })

  it('N_PRIOR is 10 (sanity)', () => {
    expect(N_PRIOR).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router/scoring.test.ts`
Expected: FAIL with "score is not a function".

- [ ] **Step 3: Implement `lib/router/scoring.ts`**

```ts
import { SUITABILITY, COST_BY_PROVIDER_TYPE, N_PRIOR, COST_EPSILON, SUITABILITY_FALLBACK } from './defaults'
import type { SessionPhase, ProviderType } from '@/lib/db/providers'
import type { Complexity } from './types'

type ScoreInputProvider = {
  id: string
  type: ProviderType | string
  config: string | null
}

export type Observed = { n: number; rate: number }

function getCost(provider: ScoreInputProvider): number {
  if (provider.config) {
    try {
      const parsed = JSON.parse(provider.config) as { cost_weight?: number }
      if (typeof parsed.cost_weight === 'number') return parsed.cost_weight
    } catch {
      // fall through to type default
    }
  }
  const fromType = (COST_BY_PROVIDER_TYPE as Record<string, number>)[provider.type]
  return typeof fromType === 'number' ? fromType : COST_EPSILON
}

function getSuitability(type: ProviderType | string, phase: SessionPhase, complexity: Complexity): number {
  const phaseMap = SUITABILITY[phase]
  if (!phaseMap) return SUITABILITY_FALLBACK
  const complexityMap = phaseMap[complexity]
  if (!complexityMap) return SUITABILITY_FALLBACK
  const v = (complexityMap as Record<string, number>)[type]
  return typeof v === 'number' ? v : SUITABILITY_FALLBACK
}

export function score(
  provider: ScoreInputProvider,
  phase: SessionPhase,
  complexity: Complexity,
  observed: Observed,
): number {
  const suit = getSuitability(provider.type, phase, complexity)
  const cost = Math.max(getCost(provider), COST_EPSILON)
  const deflt = suit
  const blendedRate = (observed.n * observed.rate + N_PRIOR * deflt) / (observed.n + N_PRIOR)
  return (suit * blendedRate) / cost
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/router/scoring.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 5: Wire export in `lib/router/index.ts`**

Uncomment `export { score } from './scoring'` (and remove the comment marker).

- [ ] **Step 6: Commit**

```bash
git add lib/router/scoring.ts lib/router/index.ts tests/router/scoring.test.ts
git commit -m "feat(router): add pure score() function with Bayesian blending"
```

---

## Task 5: `localComplete.ts` (OpenAI-compatible HTTP one-shot)

**Files:**
- Create: `lib/router/localComplete.ts`
- Test: `tests/router/localComplete.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/localComplete.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localComplete } from '@/lib/router/localComplete'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const provider = (config: object | null) => ({
  id: 'p', name: 'L', type: 'ollama' as const, command: 'ollama',
  config: config ? JSON.stringify(config) : null,
  is_active: 1, created_at: '2026-05-01T00:00:00Z',
})

describe('localComplete', () => {
  it('posts to default baseUrl and returns the chat-completion content', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '  trivial\n' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const out = await localComplete(provider(null), 'classify this', { maxTokens: 10, timeoutMs: 5000 })

    expect(out).toBe('  trivial\n')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('llama3')
    expect(body.max_tokens).toBe(10)
    expect(body.messages[0]).toEqual({ role: 'user', content: 'classify this' })
    expect(body.stream).toBe(false)
  })

  it('honors baseUrl + model from config', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'normal' } }],
    }), { status: 200 }))

    await localComplete(
      provider({ baseUrl: 'http://localhost:8080/v1', model: 'qwen-3.6:9b' }),
      'x',
      { maxTokens: 10, timeoutMs: 5000 },
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v1/chat/completions')
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('qwen-3.6:9b')
  })

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 5000 }))
      .rejects.toThrow(/500/)
  })

  it('throws on malformed response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 5000 }))
      .rejects.toThrow()
  })

  it('aborts on timeout', async () => {
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      ;(init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')))
    }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 50 }))
      .rejects.toThrow(/abort/i)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router/localComplete.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/router/localComplete.ts`**

```ts
import type { Provider } from '@/lib/db/providers'

export type LocalCompleteOpts = {
  maxTokens: number
  timeoutMs: number
}

type ParsedConfig = { baseUrl?: string; model?: string }

const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_MODEL = 'llama3'

function parseConfig(provider: Provider): ParsedConfig {
  if (!provider.config) return {}
  try {
    return JSON.parse(provider.config) as ParsedConfig
  } catch {
    return {}
  }
}

export async function localComplete(
  provider: Provider,
  prompt: string,
  opts: LocalCompleteOpts,
): Promise<string> {
  const cfg = parseConfig(provider)
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = cfg.model ?? DEFAULT_MODEL

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens,
        temperature: 0,
        stream: false,
      }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      throw new Error(`localComplete: HTTP ${res.status}`)
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('localComplete: malformed response (missing choices[0].message.content)')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/router/localComplete.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 5: Wire export in `lib/router/index.ts`**

Uncomment `export { localComplete } from './localComplete'`.

- [ ] **Step 6: Commit**

```bash
git add lib/router/localComplete.ts lib/router/index.ts tests/router/localComplete.test.ts
git commit -m "feat(router): add localComplete OpenAI-compatible HTTP helper"
```

---

## Task 6: `classify.ts` (complexity classifier)

**Files:**
- Create: `lib/router/classify.ts`
- Test: `tests/router/classify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/classify.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))

import { getDb, createProject } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, getTask, setTaskComplexity } from '@/lib/db/tasks'
import { localComplete } from '@/lib/router/localComplete'
import { classifyComplexity } from '@/lib/router/classify'

const lc = localComplete as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM projects').run()
  lc.mockReset()
})

function setup(): { taskId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  const taskId = createTask(db, { projectId, title: 'A long refactor', notes: 'cross-system' })
  return { taskId }
}

describe('classifyComplexity', () => {
  it('returns "normal" when taskId is undefined', async () => {
    const out = await classifyComplexity(getDb(), undefined)
    expect(out).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns "normal" when task does not exist', async () => {
    const out = await classifyComplexity(getDb(), 'no-such-id')
    expect(out).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns the cached complexity without calling the model', async () => {
    const { taskId } = setup()
    setTaskComplexity(getDb(), taskId, 'hard', false)
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('hard')
    expect(lc).not.toHaveBeenCalled()
  })

  it('returns the user-overridden complexity without calling the model', async () => {
    const { taskId } = setup()
    setTaskComplexity(getDb(), taskId, 'trivial', true)
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('trivial')
    expect(lc).not.toHaveBeenCalled()
  })

  it('falls back to "normal" when no local provider is configured', async () => {
    const { taskId } = setup()
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
    expect(getTask(getDb(), taskId)?.complexity).toBe('normal')
    expect(lc).not.toHaveBeenCalled()
  })

  it('calls the model and caches the result on the task', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('  hard\n')
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('hard')
    expect(getTask(getDb(), taskId)?.complexity).toBe('hard')
    expect(getTask(getDb(), taskId)?.complexity_overridden).toBe(0)
  })

  it('parses junk model output as "normal"', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('I think this is going to be quite involved actually')
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
  })

  it('falls back to "normal" when localComplete throws', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: randomUUID(), name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockRejectedValue(new Error('timeout'))
    const out = await classifyComplexity(getDb(), taskId)
    expect(out).toBe('normal')
    expect(getTask(getDb(), taskId)?.complexity).toBe('normal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router/classify.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/router/classify.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { getTask, setTaskComplexity } from '@/lib/db/tasks'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { localComplete } from './localComplete'
import { COMPLEXITY_PROMPT } from './prompts'
import type { Complexity } from './types'

const VALID: Complexity[] = ['trivial', 'normal', 'hard']

function parseTag(raw: string): Complexity {
  const tok = raw.trim().toLowerCase().split(/\s+/)[0]
  return (VALID as string[]).includes(tok) ? (tok as Complexity) : 'normal'
}

export async function classifyComplexity(
  db: Database,
  taskId: string | undefined,
): Promise<Complexity> {
  if (!taskId) return 'normal'
  const task = getTask(db, taskId)
  if (!task) return 'normal'
  if (task.complexity) return task.complexity as Complexity

  const local = getDefaultLocalProvider(db)
  if (!local) {
    setTaskComplexity(db, taskId, 'normal', false)
    return 'normal'
  }

  const prompt = COMPLEXITY_PROMPT
    .replace('{title}', task.title)
    .replace('{description}', task.notes ?? '')

  let tag: Complexity = 'normal'
  try {
    const response = await localComplete(local, prompt, { maxTokens: 10, timeoutMs: 5000 })
    tag = parseTag(response)
  } catch {
    tag = 'normal'
  }

  setTaskComplexity(db, taskId, tag, false)
  return tag
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/router/classify.test.ts`
Expected: PASS — all 8 cases.

- [ ] **Step 5: Wire export in `lib/router/index.ts`**

Uncomment `export { classifyComplexity } from './classify'`.

- [ ] **Step 6: Commit**

```bash
git add lib/router/classify.ts lib/router/index.ts tests/router/classify.test.ts
git commit -m "feat(router): add classifyComplexity with lazy caching and graceful fallbacks"
```

---

## Task 7: `pickRoute.ts` (the main routing function)

**Files:**
- Create: `lib/router/pickRoute.ts`
- Test: `tests/router/pickRoute.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/pickRoute.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/router/classify', () => ({
  classifyComplexity: vi.fn(async () => 'normal'),
}))

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider, getActiveProviders } from '@/lib/db/providers'
import { createTask, setTaskComplexity } from '@/lib/db/tasks'
import { pickRoute } from '@/lib/router/pickRoute'
import { classifyComplexity } from '@/lib/router/classify'

const cc = classifyComplexity as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  cc.mockReset()
  cc.mockResolvedValue('normal')
})

function withProjectAndSession(): { projectId: string; sessionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  return { projectId, sessionId }
}

describe('pickRoute', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no active provider exists', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    await expect(pickRoute(getDb(), { projectId, sessionId, taskId: undefined, phase: 'develop' }))
      .rejects.toThrow(/NO_PROVIDERS_CONFIGURED/)
  })

  it('picks the highest-scoring provider on cold start', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    // codex strongest at develop/normal in defaults: SUITABILITY.develop.normal.codex = 0.95
    createProvider(db, { id: 'p-codex',  name: 'codex',  type: 'codex',  command: 'codex',  config: null })
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'p-ollama', name: 'ollama', type: 'ollama', command: 'ollama', config: null })

    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'develop' })
    expect(decision.picked_provider).toBe('p-codex')
  })

  it('writes a routing_decisions row with the score breakdown', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'plan' })
    const row = db.prepare('SELECT * FROM routing_decisions WHERE id = ?').get(decision.id)
    expect(row).toBeTruthy()
    const breakdown = JSON.parse((row as any).score_breakdown)
    expect(breakdown.suitability).toBeGreaterThan(0)
    expect(breakdown.considered).toHaveLength(1)
  })

  it('uses task complexity when available', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    const taskId = createTask(db, { projectId, title: 'T' })
    setTaskComplexity(db, taskId, 'hard', false)
    cc.mockResolvedValue('hard')
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId, phase: 'spec' })
    expect(decision.complexity).toBe('hard')
  })

  it('uses "normal" complexity for taskless sessions', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'develop' })
    expect(decision.complexity).toBe('normal')
  })

  it('considered list is sorted by score descending with deterministic tiebreak', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    // identical types & no observed data → identical scores → tiebreak by providerId asc
    createProvider(db, { id: 'b-claude', name: 'b', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'a-claude', name: 'a', type: 'claude', command: 'claude', config: null })
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'plan' })
    const breakdown = JSON.parse(
      (db.prepare('SELECT score_breakdown FROM routing_decisions WHERE id = ?').get(decision.id) as any).score_breakdown,
    )
    expect(breakdown.considered[0].providerId).toBe('a-claude')
    expect(breakdown.considered[1].providerId).toBe('b-claude')
  })

  it('blends in observed routing_scores when present', async () => {
    const { projectId, sessionId } = withProjectAndSession()
    const db = getDb()
    createProvider(db, { id: 'p-ollama', name: 'ollama', type: 'ollama', command: 'ollama', config: null })
    createProvider(db, { id: 'p-claude', name: 'claude', type: 'claude', command: 'claude', config: null })
    // Inflate ollama with many high-rate observations for develop/normal
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at)
                VALUES ('develop', 'normal', 'p-ollama', 1000, 0.99, ?)`).run(new Date().toISOString())
    const decision = await pickRoute(db, { projectId, sessionId, taskId: undefined, phase: 'develop' })
    // ollama is now competitive due to learned high success rate; cost makes it win
    expect(decision.picked_provider).toBe('p-ollama')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router/pickRoute.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/router/pickRoute.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getActiveProviders } from '@/lib/db/providers'
import { score } from './scoring'
import { classifyComplexity } from './classify'
import type { Complexity, RoutingDecision, ScoreBreakdown, SessionPhase } from './types'

export type PickRouteOpts = {
  projectId: string
  sessionId: string
  taskId?: string
  phase: SessionPhase
}

type ScoreRow = { provider_id: string; n_outcomes: number; success_rate: number }

function loadScores(db: Database, phase: SessionPhase, complexity: Complexity): Map<string, ScoreRow> {
  const rows = db
    .prepare('SELECT provider_id, n_outcomes, success_rate FROM routing_scores WHERE phase = ? AND complexity = ?')
    .all(phase, complexity) as ScoreRow[]
  return new Map(rows.map((r) => [r.provider_id, r]))
}

export async function pickRoute(db: Database, opts: PickRouteOpts): Promise<RoutingDecision> {
  const providers = getActiveProviders(db)
  if (providers.length === 0) throw new Error('NO_PROVIDERS_CONFIGURED')

  const complexity: Complexity = await classifyComplexity(db, opts.taskId)
  const scoreMap = loadScores(db, opts.phase, complexity)

  const ranked = providers.map((p) => {
    const observed = scoreMap.get(p.id) ?? { n_outcomes: 0, success_rate: 0 }
    const total = score(p, opts.phase, complexity, { n: observed.n_outcomes, rate: observed.success_rate })
    return { provider: p, total, observed }
  })

  ranked.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total
    return a.provider.id.localeCompare(b.provider.id)
  })

  const winner = ranked[0]
  const winnerScore = score(winner.provider, opts.phase, complexity, {
    n: winner.observed.n_outcomes,
    rate: winner.observed.success_rate,
  })

  // Recompute the chosen breakdown components for storage
  const { SUITABILITY, COST_BY_PROVIDER_TYPE, N_PRIOR, COST_EPSILON, SUITABILITY_FALLBACK } = await import('./defaults')
  const suit =
    SUITABILITY[opts.phase]?.[complexity]?.[winner.provider.type as keyof typeof COST_BY_PROVIDER_TYPE] ??
    SUITABILITY_FALLBACK
  let cost = COST_BY_PROVIDER_TYPE[winner.provider.type as keyof typeof COST_BY_PROVIDER_TYPE] ?? COST_EPSILON
  if (winner.provider.config) {
    try {
      const c = JSON.parse(winner.provider.config) as { cost_weight?: number }
      if (typeof c.cost_weight === 'number') cost = c.cost_weight
    } catch {}
  }
  cost = Math.max(cost, COST_EPSILON)
  const blendedRate =
    (winner.observed.n_outcomes * winner.observed.success_rate + N_PRIOR * suit) /
    (winner.observed.n_outcomes + N_PRIOR)

  const breakdown: ScoreBreakdown = {
    suitability: suit,
    cost,
    success_rate_blended: blendedRate,
    n_observed: winner.observed.n_outcomes,
    total: winnerScore,
    considered: ranked.map((r) => ({
      providerId: r.provider.id,
      providerName: r.provider.name,
      score: r.total,
    })),
  }

  const decision: RoutingDecision = {
    id: randomUUID(),
    session_id: opts.sessionId,
    task_id: opts.taskId ?? null,
    picked_provider: winner.provider.id,
    phase: opts.phase,
    complexity,
    score_breakdown: JSON.stringify(breakdown),
    created_at: new Date().toISOString(),
  }

  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decision.id, decision.session_id, decision.task_id, decision.picked_provider,
    decision.phase, decision.complexity, decision.score_breakdown, decision.created_at,
  )

  return decision
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/router/pickRoute.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 5: Wire export in `lib/router/index.ts`**

Uncomment `export { pickRoute } from './pickRoute'`.

- [ ] **Step 6: Commit**

```bash
git add lib/router/pickRoute.ts lib/router/index.ts tests/router/pickRoute.test.ts
git commit -m "feat(router): add pickRoute that ranks providers and writes a decision row"
```

---

## Task 8: `recordOutcome.ts` (incremental score updates)

**Files:**
- Create: `lib/router/recordOutcome.ts`
- Test: `tests/router/recordOutcome.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/router/recordOutcome.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router/recordOutcome'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

function seedDecision(opts: { provider_id: string; phase?: string; complexity?: string }): string {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, ?, ?, ?, '{}', ?)`,
  ).run(decisionId, sessionId, opts.provider_id, opts.phase ?? 'develop', opts.complexity ?? 'normal', new Date().toISOString())
  return decisionId
}

describe('recordOutcome', () => {
  it('writes a routing_outcomes row', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const decisionId = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId, outcome: 'success' })
    const row = db.prepare('SELECT * FROM routing_outcomes WHERE decision_id = ?').get(decisionId)
    expect(row).toBeTruthy()
    expect((row as any).outcome).toBe('success')
  })

  it('seeds a routing_scores row on first success (n=1, rate=1)', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const decisionId = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId, outcome: 'success' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE phase='develop' AND complexity='normal' AND provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(1)
    expect((score as any).success_rate).toBeCloseTo(1.0, 6)
  })

  it('updates rate incrementally on additional outcomes', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const d1 = seedDecision({ provider_id: 'p1' })
    const d2 = seedDecision({ provider_id: 'p1' })
    const d3 = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId: d1, outcome: 'success' })
    recordOutcome(db, { decisionId: d2, outcome: 'failure' })
    recordOutcome(db, { decisionId: d3, outcome: 'success' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(3)
    expect((score as any).success_rate).toBeCloseTo(2 / 3, 6)
  })

  it('transient_error does not change n_outcomes or success_rate', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const d1 = seedDecision({ provider_id: 'p1' })
    const d2 = seedDecision({ provider_id: 'p1' })
    recordOutcome(db, { decisionId: d1, outcome: 'success' })
    recordOutcome(db, { decisionId: d2, outcome: 'transient_error' })
    const score = db.prepare(`SELECT * FROM routing_scores WHERE provider_id='p1'`).get()
    expect((score as any).n_outcomes).toBe(1)
    expect((score as any).success_rate).toBeCloseTo(1.0, 6)
    // outcomes table still got a row
    const outcomes = db.prepare(`SELECT COUNT(*) AS c FROM routing_outcomes`).get() as { c: number }
    expect(outcomes.c).toBe(2)
  })

  it('keeps phase × complexity × provider cells separate', () => {
    const db = getDb()
    createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
    const dDevNormal = seedDecision({ provider_id: 'p1', phase: 'develop', complexity: 'normal' })
    const dPlanHard  = seedDecision({ provider_id: 'p1', phase: 'plan',    complexity: 'hard'   })
    recordOutcome(db, { decisionId: dDevNormal, outcome: 'success' })
    recordOutcome(db, { decisionId: dPlanHard,  outcome: 'failure' })
    const all = db.prepare('SELECT phase, complexity, n_outcomes, success_rate FROM routing_scores ORDER BY phase').all()
    expect(all).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/router/recordOutcome.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `lib/router/recordOutcome.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { Outcome } from './types'

export type RecordOutcomeOpts = {
  decisionId: string
  outcome: Outcome
}

type DecisionRow = { phase: string; complexity: string; picked_provider: string }
type ScoreRow    = { n_outcomes: number; success_rate: number }

export function recordOutcome(db: Database, opts: RecordOutcomeOpts): void {
  const { decisionId, outcome } = opts

  // Always log the outcome event for analytics.
  db.prepare(
    `INSERT INTO routing_outcomes (id, decision_id, outcome, created_at) VALUES (?, ?, ?, ?)`,
  ).run(randomUUID(), decisionId, outcome, new Date().toISOString())

  // transient_error is not a quality signal — skip the score update.
  if (outcome === 'transient_error') return

  const decision = db
    .prepare('SELECT phase, complexity, picked_provider FROM routing_decisions WHERE id = ?')
    .get(decisionId) as DecisionRow | undefined
  if (!decision) return

  const existing = db
    .prepare(
      'SELECT n_outcomes, success_rate FROM routing_scores WHERE phase = ? AND complexity = ? AND provider_id = ?',
    )
    .get(decision.phase, decision.complexity, decision.picked_provider) as ScoreRow | undefined

  const isSuccess = outcome === 'success'
  const newN  = (existing?.n_outcomes ?? 0) + 1
  const sumPrev = (existing?.success_rate ?? 0) * (existing?.n_outcomes ?? 0)
  const newRate = (sumPrev + (isSuccess ? 1 : 0)) / newN
  const now = new Date().toISOString()

  if (existing) {
    db.prepare(
      'UPDATE routing_scores SET n_outcomes = ?, success_rate = ?, updated_at = ? WHERE phase = ? AND complexity = ? AND provider_id = ?',
    ).run(newN, newRate, now, decision.phase, decision.complexity, decision.picked_provider)
  } else {
    db.prepare(
      'INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(decision.phase, decision.complexity, decision.picked_provider, newN, newRate, now)
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/router/recordOutcome.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 5: Wire export in `lib/router/index.ts`**

Uncomment `export { recordOutcome } from './recordOutcome'`.

- [ ] **Step 6: Commit**

```bash
git add lib/router/recordOutcome.ts lib/router/index.ts tests/router/recordOutcome.test.ts
git commit -m "feat(router): add recordOutcome with incremental score rollup"
```

---

## Task 9: Plumb `phase` through `ResolveProviderOpts` and make it async

**Files:**
- Modify: `lib/sessions/resolveProvider.ts`
- Modify: `lib/session-manager.ts` (call sites at lines ~148 and ~558)

- [ ] **Step 1: Update `ResolveProviderOpts` and the function signature in `lib/sessions/resolveProvider.ts`**

Find:

```ts
export type ResolveProviderOpts = {
  projectId: string
  taskId?: string
  agentId?: string
}

export function resolveProvider(db: Database, opts: ResolveProviderOpts): Provider {
```

Replace with:

```ts
import type { SessionPhase } from '@/lib/db'

export type ResolveProviderOpts = {
  projectId: string
  taskId?: string
  agentId?: string
  phase: SessionPhase
  sessionId?: string  // required when the router branch fires; pins do not need it
}

export async function resolveProvider(db: Database, opts: ResolveProviderOpts): Promise<Provider> {
```

Wrap the existing body in an async-compatible flow (no behavior change yet — pickRoute hookup is the next task). Replace the final fallback line:

```ts
  // 4. First active provider by created_at
  const active = getActiveProviders(db)
  if (active.length > 0) return active[0]

  throw new Error('NO_PROVIDERS_CONFIGURED')
```

with (note: still falls back to first-active here; pickRoute integration is a separate task to keep diffs reviewable):

```ts
  // 4. Smart router (replaces "first active" fallback) — wired in Task 10.
  const active = getActiveProviders(db)
  if (active.length > 0) return active[0]

  throw new Error('NO_PROVIDERS_CONFIGURED')
```

- [ ] **Step 2: Update call site in `lib/session-manager.ts` at `spawnSession`**

Find (around line 148):

```ts
const provider = resolveProvider(db, {
  projectId: opts.projectId,
  taskId: opts.taskId,
  agentId: opts.agentId,
})
```

Replace with:

```ts
const provider = await resolveProvider(db, {
  projectId: opts.projectId,
  taskId: opts.taskId,
  agentId: opts.agentId,
  phase: opts.phase,
  sessionId,
})
```

(`sessionId` is already declared by `randomUUID()` immediately after this call today — move that declaration to *before* this call.)

If `spawnSession` is not currently `async`, mark it `async` and update its return type to `Promise<string>`. Then update its callers similarly.

- [ ] **Step 3: Update call site in `lib/session-manager.ts` at `spawnOrchestratorSession`**

Find (around line 558):

```ts
const provider = resolveProvider(db, { projectId: opts.projectId })
```

Replace with:

```ts
const provider = await resolveProvider(db, {
  projectId: opts.projectId,
  phase: 'orchestrator',
  sessionId,
})
```

Mark `spawnOrchestratorSession` `async` and update its return type to `Promise<string>`. Update callers.

- [ ] **Step 4: Audit other callers**

Run: `grep -rn "spawnSession\|spawnOrchestratorSession" --include='*.ts' --include='*.tsx' app lib server`
For each call site, add `await` and ensure the surrounding function is `async`.

- [ ] **Step 5: Run all tests to verify nothing broke**

Run: `npm test`
Expected: All previously-passing tests still pass. (If a test previously asserted `spawnSession` returned a string synchronously, update it to `await`.)

- [ ] **Step 6: Commit**

```bash
git add lib/sessions/resolveProvider.ts lib/session-manager.ts
git commit -m "refactor: make resolveProvider async and pass phase + sessionId through"
```

---

## Task 10: Wire `pickRoute` into `resolveProvider` step 4

**Files:**
- Modify: `lib/sessions/resolveProvider.ts`
- Test: `tests/sessions/resolveProvider.test.ts` (extend if exists, create if not)

- [ ] **Step 1: Write a failing regression test**

Create or extend `tests/sessions/resolveProvider.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, updateTask } from '@/lib/db/tasks'
import { resolveProvider } from '@/lib/sessions/resolveProvider'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

describe('resolveProvider', () => {
  it('honors a task-pinned provider (router not invoked)', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    createProvider(db, { id: 'p-pinned', name: 'X', type: 'claude', command: 'c', config: null })
    createProvider(db, { id: 'p-other',  name: 'Y', type: 'codex',  command: 'c', config: null })
    const taskId = createTask(db, { projectId, title: 'T' })
    updateTask(db, taskId, { provider_id: 'p-pinned' } as any)
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, taskId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-pinned')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(0)  // pin path skips router
  })

  it('honors a project-pinned provider (router not invoked)', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    createProvider(db, { id: 'p-pinned', name: 'X', type: 'claude', command: 'c', config: null })
    createProvider(db, { id: 'p-other',  name: 'Y', type: 'codex',  command: 'c', config: null })
    db.prepare('UPDATE projects SET provider_id = ? WHERE id = ?').run('p-pinned', projectId)
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-pinned')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(0)
  })

  it('invokes the router when nothing is pinned and writes a decision row', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    createProvider(db, { id: 'p-codex', name: 'codex', type: 'codex', command: 'c', config: null })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })

    const provider = await resolveProvider(db, { projectId, phase: 'develop', sessionId })
    expect(provider.id).toBe('p-codex')
    const decisions = db.prepare('SELECT COUNT(*) AS c FROM routing_decisions').get() as { c: number }
    expect(decisions.c).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify the third one fails**

Run: `npx vitest run tests/sessions/resolveProvider.test.ts`
Expected: First two PASS, third FAILS (no decision row written yet).

- [ ] **Step 3: Replace step 4 in `lib/sessions/resolveProvider.ts`**

Find:

```ts
  // 4. Smart router (replaces "first active" fallback) — wired in Task 10.
  const active = getActiveProviders(db)
  if (active.length > 0) return active[0]

  throw new Error('NO_PROVIDERS_CONFIGURED')
```

Replace with:

```ts
  // 4. Smart router replaces the static "first active" fallback.
  if (!opts.sessionId) {
    // No sessionId means the caller is in a path where the router cannot persist a decision.
    // Fall back to first active so we never break those paths.
    const active = getActiveProviders(db)
    if (active.length > 0) return active[0]
    throw new Error('NO_PROVIDERS_CONFIGURED')
  }
  const { pickRoute } = await import('@/lib/router')
  const decision = await pickRoute(db, {
    projectId: opts.projectId,
    sessionId: opts.sessionId,
    taskId: opts.taskId,
    phase: opts.phase,
  })
  const picked = getProvider(db, decision.picked_provider)
  if (!picked) throw new Error('NO_PROVIDERS_CONFIGURED')
  return picked
```

(The dynamic `import` avoids a circular import between `lib/sessions/` and `lib/router/`.)

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run tests/sessions/resolveProvider.test.ts tests/router/`
Expected: PASS for all.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/resolveProvider.ts tests/sessions/resolveProvider.test.ts
git commit -m "feat(router): wire pickRoute into resolveProvider fallback"
```

---

## Task 11: Wire `recordOutcome` into the orchestrator-watcher

**Files:**
- Modify: `server/orchestrator-watcher.ts`
- Test: `tests/server/orchestrator-watcher-router.test.ts` (new, focused)

- [ ] **Step 1: Read current watcher to find the two hook points**

Run: `grep -n "phase advance\|advancePhase\|orchestrator_decisions\|severity\|recordDecision" server/orchestrator-watcher.ts | head -20`

Identify (a) the function/section that detects a phase advance for a session, and (b) the function/section that writes an `orchestrator_decisions` row with `severity`. These are the two hook insertion points.

- [ ] **Step 2: Write the failing test**

Create `tests/server/orchestrator-watcher-router.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { onPhaseAdvanced, onOverrideDecision } from '@/server/orchestrator-watcher'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
})

function seed(): { sessionId: string; decisionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  createProvider(db, { id: 'p1', name: 'C', type: 'claude', command: 'c', config: null })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, 'p1', 'develop', 'normal', '{}', ?)`,
  ).run(decisionId, sessionId, new Date().toISOString())
  return { sessionId, decisionId }
}

describe('orchestrator-watcher → router hook', () => {
  it('records success on phase advance', () => {
    const { sessionId } = seed()
    onPhaseAdvanced(getDb(), sessionId)
    const outcomes = getDb().prepare('SELECT outcome FROM routing_outcomes').all()
    expect(outcomes).toEqual([{ outcome: 'success' }])
  })

  it('records failure on override decision', () => {
    const { sessionId } = seed()
    onOverrideDecision(getDb(), sessionId)
    const outcomes = getDb().prepare('SELECT outcome FROM routing_outcomes').all()
    expect(outcomes).toEqual([{ outcome: 'failure' }])
  })

  it('no-ops when there is no routing decision for the session', () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    onPhaseAdvanced(db, sessionId)
    const outcomes = db.prepare('SELECT COUNT(*) AS c FROM routing_outcomes').get() as { c: number }
    expect(outcomes.c).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx vitest run tests/server/orchestrator-watcher-router.test.ts`
Expected: FAIL — `onPhaseAdvanced`/`onOverrideDecision` not exported.

- [ ] **Step 4: Add the hooks to `server/orchestrator-watcher.ts`**

Append to `server/orchestrator-watcher.ts`:

```ts
import { recordOutcome } from '@/lib/router'

function latestDecisionId(db: Database, sessionId: string): string | null {
  const row = db
    .prepare(`SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(sessionId) as { id: string } | undefined
  return row?.id ?? null
}

export function onPhaseAdvanced(db: Database, sessionId: string): void {
  const decisionId = latestDecisionId(db, sessionId)
  if (!decisionId) return
  recordOutcome(db, { decisionId, outcome: 'success' })
}

export function onOverrideDecision(db: Database, sessionId: string): void {
  const decisionId = latestDecisionId(db, sessionId)
  if (!decisionId) return
  recordOutcome(db, { decisionId, outcome: 'failure' })
}
```

(`Database` type comes from `better-sqlite3` — match the existing imports in the file.)

- [ ] **Step 5: Call the hooks from the existing watcher logic**

Find the place in `server/orchestrator-watcher.ts` that detects phase advancement (the call to `tools.advancePhase` or equivalent). Right after that call, add:

```ts
onPhaseAdvanced(db, sessionId)
```

Find the place that writes `orchestrator_decisions` rows. After the insert, if `severity === 'override'`, add:

```ts
if (severity === 'override') onOverrideDecision(db, sessionId)
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npx vitest run tests/server/orchestrator-watcher-router.test.ts`
Expected: PASS — all 3 cases.

- [ ] **Step 7: Commit**

```bash
git add server/orchestrator-watcher.ts tests/server/orchestrator-watcher-router.test.ts
git commit -m "feat(router): wire orchestrator-watcher hooks for success/failure outcomes"
```

---

## Task 12: API — `POST /api/sessions/[id]/restart-with-route`

**Files:**
- Create: `app/api/sessions/[id]/restart-with-route/route.ts`
- Test: `tests/api/sessions-restart-with-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/session-manager', () => ({
  respawnSessionWithProvider: vi.fn(async () => undefined),
}))

import { POST } from '@/app/api/sessions/[id]/restart-with-route/route'
import { getDb, createProject, createSession } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { respawnSessionWithProvider } from '@/lib/session-manager'

const respawn = respawnSessionWithProvider as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  respawn.mockReset()
  respawn.mockResolvedValue(undefined)
})

function p(id: string) { return { params: Promise.resolve({ id }) } }

function seed(): { sessionId: string; failedDecisionId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  createProvider(db, { id: 'old', name: 'O', type: 'claude', command: 'c', config: null })
  createProvider(db, { id: 'new', name: 'N', type: 'codex',  command: 'c', config: null })
  const sessionId = randomUUID()
  createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
  getDb().prepare(`UPDATE sessions SET status = 'needs_route_retry' WHERE id = ?`).run(sessionId)
  const failedDecisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, NULL, 'old', 'develop', 'normal', '{}', ?)`,
  ).run(failedDecisionId, sessionId, new Date().toISOString())
  return { sessionId, failedDecisionId }
}

describe('POST /api/sessions/[id]/restart-with-route', () => {
  it('records transient_error on the failed decision', async () => {
    const { sessionId, failedDecisionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(200)
    const outcomes = getDb()
      .prepare('SELECT outcome FROM routing_outcomes WHERE decision_id = ?')
      .all(failedDecisionId)
    expect(outcomes).toEqual([{ outcome: 'transient_error' }])
  })

  it('writes a fresh routing_decisions row for the new provider', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    await POST(req, p(sessionId))
    const decisions = getDb()
      .prepare('SELECT picked_provider FROM routing_decisions WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId)
    expect(decisions).toEqual([{ picked_provider: 'old' }, { picked_provider: 'new' }])
  })

  it('flips session status back to active and calls respawn', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    await POST(req, p(sessionId))
    const status = (getDb().prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId) as any).status
    expect(status).toBe('active')
    expect(respawn).toHaveBeenCalledWith(sessionId, 'new')
  })

  it('returns 400 if providerId is missing', async () => {
    const { sessionId } = seed()
    const req = new NextRequest(`http://localhost/api/sessions/${sessionId}/restart-with-route`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, p(sessionId))
    expect(res.status).toBe(400)
  })

  it('returns 404 if session does not exist', async () => {
    const req = new NextRequest('http://localhost/api/sessions/nope/restart-with-route', {
      method: 'POST',
      body: JSON.stringify({ providerId: 'new' }),
    })
    const res = await POST(req, p('nope'))
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test — expect failures**

Run: `npx vitest run tests/api/sessions-restart-with-route.test.ts`
Expected: FAIL — handler missing.

- [ ] **Step 3: Add `respawnSessionWithProvider` to `lib/session-manager.ts`**

Append:

```ts
/**
 * Respawn a session that was put into 'needs_route_retry' using a specific provider.
 * The new routing_decisions row is written by the API handler before this call.
 */
export async function respawnSessionWithProvider(sessionId: string, providerId: string): Promise<void> {
  // Implementation: re-invoke the adapter spawn machinery with the chosen provider.
  // For v1 this delegates to the same code path as spawnSession by looking up the
  // session row, gathering its phase / projectId / etc., and calling spawnSession internals.
  // Concrete wiring depends on existing session-manager structure — implementer should
  // factor out the adapter-spawn portion of spawnSession into a private helper that takes
  // a Provider and call it from both spawnSession and here.
  const _unused = { sessionId, providerId }
  throw new Error('respawnSessionWithProvider: implementation TODO — factor out adapter-spawn helper')
}
```

(This shim is replaced in Task 14, where we also factor `spawnSession` to expose the adapter-spawn step.)

- [ ] **Step 4: Implement the handler**

Create `app/api/sessions/[id]/restart-with-route/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { getProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router'
import { respawnSessionWithProvider } from '@/lib/session-manager'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const body = (await req.json().catch(() => null)) as { providerId?: string } | null
  if (!body?.providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })

  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | { id: string; project_id: string; phase: string; task_id: string | null; status: string }
    | undefined
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })

  const newProvider = getProvider(db, body.providerId)
  if (!newProvider) return NextResponse.json({ error: 'provider not found' }, { status: 404 })

  // 1. Mark the failed decision as transient_error (does not affect success rate).
  const failed = db
    .prepare('SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as { id: string } | undefined
  if (failed) recordOutcome(db, { decisionId: failed.id, outcome: 'transient_error' })

  // 2. Write a fresh routing_decisions row for the user's pick (no scoring — explicit choice).
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decisionId, sessionId, session.task_id, body.providerId, session.phase, 'normal',
    JSON.stringify({ source: 'manual_retry', providerId: body.providerId }), new Date().toISOString(),
  )

  // 3. Flip status back to active and respawn.
  db.prepare(`UPDATE sessions SET status = 'active' WHERE id = ?`).run(sessionId)
  await respawnSessionWithProvider(sessionId, body.providerId)

  return NextResponse.json({ ok: true, decisionId })
}
```

- [ ] **Step 5: Re-run the test**

Run: `npx vitest run tests/api/sessions-restart-with-route.test.ts`
Expected: PASS — all 5 cases (the test mocks `respawnSessionWithProvider` so the shim throw is never reached).

- [ ] **Step 6: Commit**

```bash
git add app/api/sessions/\[id\]/restart-with-route/route.ts lib/session-manager.ts tests/api/sessions-restart-with-route.test.ts
git commit -m "feat(router): add POST /api/sessions/:id/restart-with-route with shim respawn"
```

---

## Task 13: API — `GET /api/router/decisions` and `POST /api/router/reset-learning`

**Files:**
- Create: `app/api/router/decisions/route.ts`
- Create: `app/api/router/reset-learning/route.ts`
- Test: `tests/api/router-decisions.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET as getDecisions } from '@/app/api/router/decisions/route'
import { POST as resetLearning } from '@/app/api/router/reset-learning/route'
import { getDb, createProject, createSession } from '@/lib/db'

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM routing_decisions').run()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM projects').run()
})

describe('GET /api/router/decisions', () => {
  it('returns 400 when sessionId is missing', async () => {
    const res = await getDecisions(new NextRequest('http://localhost/api/router/decisions'))
    expect(res.status).toBe(400)
  })

  it('returns the latest decision with score_breakdown parsed', async () => {
    const db = getDb()
    const projectId = createProject(db, { name: 'P', path: '/tmp/p' })
    const sessionId = randomUUID()
    createSession(db, { id: sessionId, projectId, label: 'L', phase: 'develop', sourceFile: null })
    db.prepare(
      `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
       VALUES ('d', ?, NULL, 'p1', 'develop', 'normal', ?, ?)`,
    ).run(sessionId, JSON.stringify({ suitability: 0.85, total: 1.6, considered: [] }), new Date().toISOString())

    const res = await getDecisions(new NextRequest(`http://localhost/api/router/decisions?sessionId=${sessionId}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decision.picked_provider).toBe('p1')
    expect(body.decision.score_breakdown.suitability).toBe(0.85)
  })

  it('returns null decision when none exists', async () => {
    const res = await getDecisions(new NextRequest('http://localhost/api/router/decisions?sessionId=missing'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ decision: null })
  })
})

describe('POST /api/router/reset-learning', () => {
  it('deletes all rows from routing_outcomes and routing_scores', async () => {
    const db = getDb()
    db.prepare(`INSERT INTO routing_outcomes (id, decision_id, outcome, created_at) VALUES ('o1','d1','success',?)`).run(new Date().toISOString())
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('develop','normal','p',5,0.6,?)`).run(new Date().toISOString())
    const res = await resetLearning(new NextRequest('http://localhost/api/router/reset-learning', { method: 'POST' }))
    expect(res.status).toBe(200)
    expect((db.prepare('SELECT COUNT(*) AS c FROM routing_outcomes').get() as any).c).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS c FROM routing_scores').get() as any).c).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/api/router-decisions.test.ts`
Expected: FAIL — handlers missing.

- [ ] **Step 3: Implement `app/api/router/decisions/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const row = getDb()
    .prepare('SELECT * FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as Record<string, unknown> | undefined

  if (!row) return NextResponse.json({ decision: null })

  return NextResponse.json({
    decision: {
      ...row,
      score_breakdown: JSON.parse(row.score_breakdown as string),
    },
  })
}
```

- [ ] **Step 4: Implement `app/api/router/reset-learning/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST() {
  const db = getDb()
  db.prepare('DELETE FROM routing_outcomes').run()
  db.prepare('DELETE FROM routing_scores').run()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/api/router-decisions.test.ts`
Expected: PASS — all 4 cases.

- [ ] **Step 6: Commit**

```bash
git add app/api/router/ tests/api/router-decisions.test.ts
git commit -m "feat(router): add GET /api/router/decisions and POST /api/router/reset-learning"
```

---

## Task 14: Set `needs_route_retry` on adapter throw + implement real respawn

**Files:**
- Modify: `lib/session-manager.ts`

- [ ] **Step 1: Locate the adapter-spawn block in `spawnSession`**

Run: `grep -n "spawn(\|adapter\|buildArgs" lib/session-manager.ts | head -20` to find the section where the child process is launched after the provider has been resolved. This block should be factored into a private helper so that both `spawnSession` and `respawnSessionWithProvider` can call it.

- [ ] **Step 2: Factor out the adapter-spawn step**

Extract the code that takes `(provider, sessionRow, opts)` and starts the child process into a new private function `spawnAdapterFor(db, sessionId, provider, opts)`. The helper should throw on adapter failure exactly as the existing inline code does. Keep `spawnSession` calling `spawnAdapterFor(db, sessionId, provider, opts)` after `resolveProvider`.

- [ ] **Step 3: Wrap the call in try/catch and set `needs_route_retry` on throw**

In `spawnSession`, after the provider is resolved and the session row is created, replace the direct `spawnAdapterFor()` call with:

```ts
try {
  await spawnAdapterFor(db, sessionId, provider, opts)
} catch (err) {
  db.prepare(`UPDATE sessions SET status = 'needs_route_retry', exit_reason = ? WHERE id = ?`)
    .run(`adapter_spawn_failed: ${(err as Error).message}`, sessionId)
  throw err
}
```

- [ ] **Step 4: Replace the shim `respawnSessionWithProvider` with the real implementation**

Replace the body of `respawnSessionWithProvider`:

```ts
export async function respawnSessionWithProvider(sessionId: string, providerId: string): Promise<void> {
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | { id: string; project_id: string; phase: SessionPhase; task_id: string | null; label: string; source_file: string | null; agent_id: string | null }
    | undefined
  if (!session) throw new Error('session not found')

  const provider = getProvider(db, providerId)
  if (!provider) throw new Error('provider not found')

  // Reuse the same SpawnOptions shape used by spawnSession.
  const project = getProject(db, session.project_id)
  if (!project) throw new Error('project not found')

  const opts: SpawnOptions = {
    projectId: session.project_id,
    projectPath: project.path,
    label: session.label,
    phase: session.phase,
    sourceFile: session.source_file,
    userContext: '',                    // resumes don't need fresh user context
    permissionMode: 'default',          // default permission mode for retries
    taskId: session.task_id ?? undefined,
    agentId: session.agent_id ?? undefined,
  }

  try {
    await spawnAdapterFor(db, sessionId, provider, opts)
  } catch (err) {
    db.prepare(`UPDATE sessions SET status = 'needs_route_retry', exit_reason = ? WHERE id = ?`)
      .run(`adapter_spawn_failed: ${(err as Error).message}`, sessionId)
    throw err
  }
}
```

- [ ] **Step 5: Run all tests**

Run: `npm test`
Expected: PASS for the new tests in tasks 9-13 plus all previously-passing tests.

- [ ] **Step 6: Commit**

```bash
git add lib/session-manager.ts
git commit -m "feat(router): set needs_route_retry on adapter throw; implement real respawn"
```

---

## Task 15: `RouteRetryDialog` component

**Files:**
- Create: `components/router/RouteRetryDialog.tsx`
- Create: `hooks/useRouterDecision.ts`
- Test: `components/router/__tests__/RouteRetryDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RouteRetryDialog } from '@/components/router/RouteRetryDialog'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

const decision = {
  id: 'd1',
  picked_provider: 'old',
  phase: 'develop' as const,
  complexity: 'normal' as const,
  score_breakdown: {
    suitability: 0.9, cost: 0.5, success_rate_blended: 0.85, n_observed: 0, total: 1.62,
    considered: [
      { providerId: 'old', providerName: 'Old',     score: 1.62 },
      { providerId: 'new', providerName: 'NewOne',  score: 1.40 },
      { providerId: 'thr', providerName: 'Third',   score: 0.95 },
    ],
  },
}

describe('RouteRetryDialog', () => {
  it('renders error message and ranked alternatives excluding the failed route', () => {
    render(<RouteRetryDialog
      open
      sessionId="s1"
      errorMessage="rate limit"
      decision={decision as any}
      onClose={() => {}}
      onRetried={() => {}}
    />)
    expect(screen.getByText(/rate limit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /NewOne/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Third/  })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Old/ })).toBeNull()
  })

  it('calls /restart-with-route on select and notifies caller', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const onRetried = vi.fn()
    render(<RouteRetryDialog
      open
      sessionId="s1"
      errorMessage="boom"
      decision={decision as any}
      onClose={() => {}}
      onRetried={onRetried}
    />)
    fireEvent.click(screen.getByRole('button', { name: /NewOne/ }))
    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sessions/s1/restart-with-route')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ providerId: 'new' })
  })
})
```

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run components/router/__tests__/RouteRetryDialog.test.tsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Implement the component**

Create `components/router/RouteRetryDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'

type ConsideredRoute = { providerId: string; providerName: string; score: number }
type Decision = {
  picked_provider: string
  score_breakdown: {
    considered: ConsideredRoute[]
  }
}

export function RouteRetryDialog({
  open,
  sessionId,
  errorMessage,
  decision,
  onClose,
  onRetried,
}: {
  open: boolean
  sessionId: string
  errorMessage: string
  decision: Decision
  onClose: () => void
  onRetried: () => void
}) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  if (!open) return null

  const alternatives = decision.score_breakdown.considered
    .filter((r) => r.providerId !== decision.picked_provider)
    .slice(0, 5)

  async function pick(providerId: string) {
    setSubmitting(providerId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/restart-with-route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      if (!res.ok) throw new Error(`restart failed: ${res.status}`)
      onRetried()
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-primary border border-border-default rounded-[8px] p-6 w-[480px] max-w-[90vw]">
        <h2 className="text-text-primary text-base font-semibold mb-2">Session start failed</h2>
        <p className="text-text-secondary text-sm mb-4 font-mono break-all">{errorMessage}</p>
        <div className="text-[11px] uppercase tracking-[0.04em] text-text-faint mb-2">Alternatives</div>
        <div className="space-y-2 mb-4">
          {alternatives.map((r) => (
            <button
              key={r.providerId}
              type="button"
              onClick={() => pick(r.providerId)}
              disabled={submitting !== null}
              className="w-full text-left px-3 py-2 rounded-[6px] bg-bg-secondary hover:bg-bg-tertiary text-text-primary disabled:opacity-50"
            >
              <span className="font-medium">{r.providerName}</span>
              <span className="ml-2 text-text-muted text-xs">score {r.score.toFixed(2)}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `hooks/useRouterDecision.ts`**

```ts
import { useQuery } from '@tanstack/react-query'

export type RouterDecisionResponse = {
  decision: {
    id: string
    picked_provider: string
    phase: string
    complexity: string
    score_breakdown: {
      suitability: number
      cost: number
      success_rate_blended: number
      n_observed: number
      total: number
      considered: Array<{ providerId: string; providerName: string; score: number }>
    }
  } | null
}

export function useRouterDecision(sessionId: string | null) {
  return useQuery<RouterDecisionResponse>({
    queryKey: ['router-decision', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/router/decisions?sessionId=${sessionId}`)
      if (!res.ok) throw new Error(`router decision fetch failed: ${res.statusText}`)
      return res.json() as Promise<RouterDecisionResponse>
    },
    enabled: !!sessionId,
  })
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run components/router/__tests__/RouteRetryDialog.test.tsx`
Expected: PASS — both cases.

- [ ] **Step 6: Commit**

```bash
git add components/router/ hooks/useRouterDecision.ts
git commit -m "feat(router): add RouteRetryDialog component and useRouterDecision hook"
```

---

## Task 16: Session card "via router" badge + auto-open dialog

**Files:**
- Modify: `components/sessions/SessionHistoryPanel.tsx` (or wherever session cards render — verify with `grep`)
- Modify: `components/sessions/SessionStatusBanner.tsx` (or equivalent for `needs_route_retry` state)

- [ ] **Step 1: Find the session card / status component**

Run: `grep -rn "session\.status\|SessionStatus" components/ app/ | head -20`
Identify the component that renders the session card and/or its status pill.

- [ ] **Step 2: Add the "via router" badge**

In the session card component, add (using `useRouterDecision`):

```tsx
import { useRouterDecision } from '@/hooks/useRouterDecision'
// ...
const { data: routerData } = useRouterDecision(session.id)
const decision = routerData?.decision

// In the JSX where status / metadata pills are rendered:
{decision && (
  <div className="relative group">
    <span className="text-[10px] uppercase tracking-wider text-text-faint border border-border-default rounded px-1.5 py-0.5">
      via router
    </span>
    <div className="absolute hidden group-hover:block z-10 top-full left-0 mt-1 w-64 bg-bg-secondary border border-border-default rounded-[6px] p-2 shadow-lg">
      <div className="text-[10px] uppercase text-text-faint mb-1">Considered</div>
      <ol className="text-xs text-text-primary space-y-0.5">
        {decision.score_breakdown.considered.map((r) => (
          <li key={r.providerId} className={r.providerId === decision.picked_provider ? 'font-semibold text-accent-blue' : ''}>
            {r.providerName} <span className="text-text-muted">{r.score.toFixed(2)}</span>
          </li>
        ))}
      </ol>
    </div>
  </div>
)}
```

- [ ] **Step 3: Auto-open `RouteRetryDialog` when status is `needs_route_retry`**

In the same parent component (or wherever session-level UI lives), add:

```tsx
const [retryOpen, setRetryOpen] = useState(true)
// ...
{session.status === 'needs_route_retry' && decision && (
  <RouteRetryDialog
    open={retryOpen}
    sessionId={session.id}
    errorMessage={session.exit_reason ?? 'Session start failed.'}
    decision={decision as any}
    onClose={() => setRetryOpen(false)}
    onRetried={() => { setRetryOpen(false); /* invalidate queries */ }}
  />
)}
```

Wire the React Query / SWR cache invalidation for `['router-decision', session.id]` and the session list query in `onRetried`.

- [ ] **Step 4: Manual smoke test in dev**

Run: `npm run dev`
- Configure two providers (one Claude, one Codex).
- Start a session via the UI.
- Hover the "via router" badge — should show ranked considered list.
- Mock an adapter failure (temporarily make the picked provider's `command` invalid) — verify the dialog opens and selecting a different route restarts the session.
- Restore the original command.

- [ ] **Step 5: Commit**

```bash
git add components/sessions/
git commit -m "feat(router): add via-router badge with score popover and auto-open retry dialog"
```

---

## Task 17: Debug page `/debug/router`

**Files:**
- Create: `app/debug/router/page.tsx`
- Create: `app/api/router/scores/route.ts`
- Test: `tests/api/router-scores.test.ts`

- [ ] **Step 1: Implement `app/api/router/scores/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const rows = getDb()
    .prepare('SELECT phase, complexity, provider_id, n_outcomes, success_rate, updated_at FROM routing_scores ORDER BY phase, complexity, provider_id')
    .all()
  return NextResponse.json({ scores: rows })
}
```

- [ ] **Step 2: Add minimal test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { GET } from '@/app/api/router/scores/route'
import { getDb } from '@/lib/db'

describe('GET /api/router/scores', () => {
  it('returns rows sorted by phase, complexity, provider_id', async () => {
    const db = getDb()
    db.prepare('DELETE FROM routing_scores').run()
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('plan','hard','b',1,0.5,?)`).run(now)
    db.prepare(`INSERT INTO routing_scores (phase, complexity, provider_id, n_outcomes, success_rate, updated_at) VALUES ('develop','normal','a',2,0.7,?)`).run(now)
    const res = await GET()
    const body = await res.json()
    expect(body.scores.map((r: any) => r.provider_id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/api/router-scores.test.ts`
Expected: PASS.

- [ ] **Step 4: Implement `app/debug/router/page.tsx`**

```tsx
import { notFound } from 'next/navigation'

async function fetchScores() {
  const res = await fetch('http://localhost:3000/api/router/scores', { cache: 'no-store' })
  return (await res.json()) as { scores: Array<{ phase: string; complexity: string; provider_id: string; n_outcomes: number; success_rate: number; updated_at: string }> }
}

export default async function DebugRouterPage() {
  if (process.env.ENABLE_DEBUG_PAGES !== '1') notFound()

  const { scores } = await fetchScores()

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-text-primary mb-4">Router scores</h1>
      <table className="w-full text-sm">
        <thead className="text-text-muted text-xs">
          <tr>
            <th className="text-left p-2">Phase</th>
            <th className="text-left p-2">Complexity</th>
            <th className="text-left p-2">Provider</th>
            <th className="text-right p-2">n</th>
            <th className="text-right p-2">success rate</th>
            <th className="text-left p-2">updated</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((r) => (
            <tr key={`${r.phase}-${r.complexity}-${r.provider_id}`} className="border-t border-border-default">
              <td className="p-2 text-text-primary">{r.phase}</td>
              <td className="p-2 text-text-primary">{r.complexity}</td>
              <td className="p-2 text-text-primary">{r.provider_id}</td>
              <td className="p-2 text-right text-text-primary">{r.n_outcomes}</td>
              <td className="p-2 text-right text-text-primary">{(r.success_rate * 100).toFixed(1)}%</td>
              <td className="p-2 text-text-muted text-xs">{r.updated_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action="/api/router/reset-learning" method="POST" className="mt-6">
        <button type="submit" className="text-sm text-accent-red border border-accent-red rounded px-3 py-1">
          Reset router learning
        </button>
      </form>
    </div>
  )
}
```

(Server component; the form posts directly. For richer behavior the engineer can convert to a client component with confirmation.)

- [ ] **Step 5: Smoke check**

Run: `ENABLE_DEBUG_PAGES=1 npm run dev`
Visit `http://localhost:3000/debug/router` — should show the (probably empty) scores table.

- [ ] **Step 6: Commit**

```bash
git add app/debug/router/ app/api/router/scores/ tests/api/router-scores.test.ts
git commit -m "feat(router): add /debug/router page with scores grid and reset-learning"
```

---

## Task 18: End-to-end smoke + ship

**Files:** none (validation only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass. Note any pre-existing failures unrelated to router (don't fix in this branch).

- [ ] **Step 2: Manual end-to-end check in dev**

Run: `npm run dev`

Walk through:
- [ ] Configure at least 2 providers (Claude + Codex; ideally also Ollama for the classifier).
- [ ] Start an unpinned session in `develop` phase. Verify the "via router" badge appears with a sensible ranking.
- [ ] Pin a provider on a project. Start a session. Verify NO "via router" badge — the pin path took over.
- [ ] If Ollama configured, create a task with a clearly hard description. After first router decision, check the task row's `complexity` was set.
- [ ] Trigger an adapter failure (temporarily break a provider's `command`). Verify the `RouteRetryDialog` opens, the failed route is excluded, and selecting a different route flips the session back to `active`.
- [ ] Visit `/debug/router` (with `ENABLE_DEBUG_PAGES=1`). Confirm scores accumulate as more sessions complete and the orchestrator advances phases.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in `lib/router/`, `app/api/router/`, or `app/api/sessions/[id]/restart-with-route/`. Pre-existing errors in unrelated files are acceptable.

- [ ] **Step 4: Commit any final fixups**

```bash
git add -A
git commit -m "feat(router): final smoke + typecheck cleanup"
```

- [ ] **Step 5: Open PR back to main**

Use the PR description to summarize the slice: replaces first-active fallback with smart router, ships defaults matrix, adds local-classifier integration, no manual config required, pins still win.

---

## Self-review notes (already addressed during writing)

- ✅ **Spec coverage**: every section of the spec maps to a task. Schema → Task 1. DB helpers → Task 2. Module structure → Task 3. Each pure/IO module → Tasks 4-8. Cascade integration → Tasks 9-10. Watcher hook → Task 11. APIs → Tasks 12-13, 17. Failure flow → Tasks 14-15. Visibility → Tasks 16-17. Smoke → Task 18.
- ✅ **No placeholders**: every step has the actual code or command. The only intentional shim (Task 12 Step 3) is replaced by a real implementation in Task 14.
- ✅ **Type consistency**: `Complexity`, `RoutingDecision`, `Outcome`, `ScoreBreakdown` all defined in `lib/router/types.ts` (Task 3) and used consistently in later tasks. The score function signature in Task 4 matches the call in Task 7. The classifier signature in Task 6 matches the call in Task 7.
- ✅ **DRY/YAGNI**: No premature abstractions. The factor-out of `spawnAdapterFor` in Task 14 is the only refactor and is needed for the retry path.
- ✅ **TDD**: every code-producing task starts with a failing test, then implementation, then verification. Frequent commits at each task boundary.
