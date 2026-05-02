# Reflective Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle six features that share infrastructure (job queue, embedding index, llama.cpp client) so every completed session compounds into router learning, structured next-actions, prep-refresh, search, and critic findings.

**Architecture:** 5 migrations (65–69), an in-process scheduler in `server.ts`, an OpenAI-compatible embedding client, and 6 job kinds backed by individual handlers. UI surfaces in drawer / docs page / insights page / tasks page.

**Tech Stack:** Next.js 16.2.1, React 19, better-sqlite3, vitest. llama.cpp via OpenAI-compatible HTTP for both `/v1/chat/completions` (existing `localComplete`) and `/v1/embeddings` (new `localEmbed`).

**Reference docs:**
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — Suspense rule still applies if any new client component reads `useSearchParams`.

**Spec:** `docs/superpowers/specs/2026-05-02-reflective-workflow-design.md` — read before each task.

---

## Task 1: Migrations 65–69 + `recordOutcome` extension

**Files:**
- Modify: `lib/db.ts` (add migrations 65–69 + sentinel migration `999_001`; runMigration unchanged)
- Modify: `lib/router/types.ts` (extend `Outcome` enum with `'partial'`)
- Modify: `lib/router/recordOutcome.ts` (score-based math)
- Modify: `lib/db.ts` `Session` type literal at lines 31-47 (add `grade`, `grade_reason`, `graded_at`, `next_actions` — all optional `string | null`)
- Modify: `hooks/useSessions.ts` `Session` type (mirror with `?:` optional)
- Create: `tests/db/reflective-migrations.test.ts`
- Modify: `lib/router/__tests__/recordOutcome.test.ts` (or wherever it lives; add `'partial'` cases)

Foundation. Lands all schema + the `recordOutcome` API extension before any handler code.

- [ ] **Step 1: Write the failing migration tests**

Create `tests/db/reflective-migrations.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test, verify FAIL**

```
npx vitest run tests/db/reflective-migrations.test.ts
```

Expected: FAIL — none of the new tables/columns exist.

- [ ] **Step 3: Implement migrations 65–71**

The spec listed five migrations (65–69) but combining 3 ALTER TABLE statements in one migration risks a half-applied state if one column already exists (the `tolerateExisting` catch absorbs the error AND the migrations row gets inserted, but the un-applied columns silently never land). Following the existing pattern (migrations 25–27, 58–60, 61–63 each split one ALTER per version), we expand to **seven migrations**: 65–71. The spec's intent is preserved; the count is implementation detail.

In `lib/db.ts`, immediately after migration 64 (`sessions_summary`):

```ts
runMigration(db, 65, 'create_pending_jobs', `
  CREATE TABLE IF NOT EXISTS pending_jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT    NOT NULL,
    payload      TEXT    NOT NULL,
    dedup_key    TEXT,
    state        TEXT    NOT NULL DEFAULT 'pending',
    attempts     INTEGER NOT NULL DEFAULT 0,
    last_error   TEXT,
    scheduled_at TEXT    NOT NULL,
    started_at   TEXT,
    finished_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pending_jobs_state_scheduled ON pending_jobs(state, scheduled_at);
  CREATE INDEX IF NOT EXISTS idx_pending_jobs_dedup_pending ON pending_jobs(dedup_key) WHERE state = 'pending';
`)

runMigration(db, 66, 'create_embeddings', `
  CREATE TABLE IF NOT EXISTS embeddings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   TEXT    NOT NULL REFERENCES projects(id),
    kind         TEXT    NOT NULL,
    ref          TEXT    NOT NULL,
    content_hash TEXT    NOT NULL,
    vector       BLOB    NOT NULL,
    dim          INTEGER NOT NULL,
    model        TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL,
    UNIQUE(project_id, kind, ref)
  );
  CREATE INDEX IF NOT EXISTS idx_embeddings_project_kind ON embeddings(project_id, kind);
`)

runMigration(db, 67, 'sessions_grade', `ALTER TABLE sessions ADD COLUMN grade TEXT`, true)
runMigration(db, 68, 'sessions_grade_reason', `ALTER TABLE sessions ADD COLUMN grade_reason TEXT`, true)
runMigration(db, 69, 'sessions_graded_at', `ALTER TABLE sessions ADD COLUMN graded_at TEXT`, true)
runMigration(db, 70, 'sessions_next_actions', `ALTER TABLE sessions ADD COLUMN next_actions TEXT`, true)

runMigration(db, 71, 'create_critic_findings', `
  CREATE TABLE IF NOT EXISTS critic_findings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   TEXT    NOT NULL REFERENCES projects(id),
    kind         TEXT    NOT NULL,
    ref          TEXT    NOT NULL,
    content_hash TEXT    NOT NULL,
    findings     TEXT    NOT NULL,
    created_at   TEXT    NOT NULL,
    UNIQUE(project_id, kind, ref)
  );
`)
```

Migration 65 and 66 each contain a CREATE TABLE plus indexes — better-sqlite3's `exec` handles `;`-separated multi-statement, and all use `IF NOT EXISTS` so re-runs are safe even without the `tolerateExisting` flag.

- [ ] **Step 4: Extend the `Session` type literals**

In `lib/db.ts` Session type at lines 31-48 (verified — the `Session` literal currently ends with `summary: string | null`). Add four new fields after `summary`:

```ts
grade: string | null
grade_reason: string | null
graded_at: string | null
next_actions: string | null
```

In `hooks/useSessions.ts` Session type, add as optional:

```ts
grade?: string | null
grade_reason?: string | null
graded_at?: string | null
next_actions?: string | null
```

- [ ] **Step 5: Extend `Outcome` enum**

In `lib/router/types.ts`:

```ts
export type Outcome = 'success' | 'failure' | 'partial' | 'transient_error'
```

- [ ] **Step 6: Update `recordOutcome` math**

In `lib/router/recordOutcome.ts`, replace the `isSuccess` branch with:

```ts
// transient_error is not a quality signal — skip the score update.
if (outcome === 'transient_error') return

// ... existing decision lookup unchanged ...

const score = outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0
const newN = (existing?.n_outcomes ?? 0) + 1
const sumPrev = (existing?.success_rate ?? 0) * (existing?.n_outcomes ?? 0)
const newRate = (sumPrev + score) / newN
```

The existing `isSuccess` variable is no longer needed; remove it. The early-return for `transient_error` stays.

- [ ] **Step 7: Update existing recordOutcome tests + add 'partial' case**

The test file is at `tests/router/recordOutcome.test.ts` (verified). Add a new test:

```ts
it('partial outcome adds 0.5 to success rate', () => {
  // setup: create project + provider + decision row
  recordOutcome(db, { decisionId, outcome: 'partial' })
  const row = db.prepare('SELECT n_outcomes, success_rate FROM routing_scores WHERE provider_id = ?').get(providerId)
  expect(row.n_outcomes).toBe(1)
  expect(row.success_rate).toBe(0.5)
})
```

Confirm existing 'success'/'failure'/'transient_error' tests still pass.

- [ ] **Step 8: Run full suite**

```
npx vitest run
```

Expected: 993 prior + 4 new migration + 1 new recordOutcome = 998 passing. If existing recordOutcome tests fail because the math changed, verify they're checking the same numbers (success still scores 1, failure still 0); if not, update fixtures.

- [ ] **Step 9: Commit**

```
git add lib/db.ts lib/router/types.ts lib/router/recordOutcome.ts hooks/useSessions.ts tests/db/reflective-migrations.test.ts tests/router/recordOutcome.test.ts
git commit -m "feat(reflective): migrations 65-69 + Outcome.partial + recordOutcome score-based math"
```

---

## Task 2: Provider config helper extraction + `localEmbed`

**Files:**
- Create: `lib/router/providerConfig.ts` (extracts `parseLocalProviderConfig` from localComplete)
- Modify: `lib/router/localComplete.ts` (use the extracted helper; no behavior change)
- Create: `lib/router/localEmbed.ts`
- Create: `tests/router/localEmbed.test.ts`

- [ ] **Step 1: Write the failing test for `localEmbed`**

Create `tests/router/localEmbed.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localEmbed, getLocalEmbeddingModel } from '@/lib/router/localEmbed'
import type { Provider } from '@/lib/db/providers'

const mockProvider: Provider = {
  id: 'p1', name: 'Local', type: 'local',
  command: 'llama', config: JSON.stringify({ baseUrl: 'http://localhost:8080/v1', embeddingModel: 'nomic-embed-text-v1.5' }),
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as never
})

describe('localEmbed', () => {
  it('POSTs to /embeddings with model and input array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }], model: 'nomic-embed-text-v1.5' }),
    })
    const result = await localEmbed(mockProvider, ['hello'], { timeoutMs: 5000 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"nomic-embed-text-v1.5"'),
      })
    )
    expect(result.embeddings).toHaveLength(1)
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array)
    expect(Array.from(result.embeddings[0])).toEqual([0.1, 0.2, 0.3])
    expect(result.dim).toBe(3)
    expect(result.model).toBe('nomic-embed-text-v1.5')
  })

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: 'unavailable' })
    await expect(localEmbed(mockProvider, ['x'], { timeoutMs: 1000 })).rejects.toThrow(/503/)
  })

  it('aborts on timeout', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))  // never resolves
    await expect(localEmbed(mockProvider, ['x'], { timeoutMs: 50 })).rejects.toThrow()
  })

  it('defaults to nomic-embed-text-v1.5 when embeddingModel is absent', () => {
    const provider: Provider = { ...mockProvider, config: '{}' }
    expect(getLocalEmbeddingModel(provider)).toBe('nomic-embed-text-v1.5')
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

```
npx vitest run tests/router/localEmbed.test.ts
```

Expected: module not found.

- [ ] **Step 3: Extract `parseLocalProviderConfig` helper**

Create `lib/router/providerConfig.ts`:

```ts
import type { Provider } from '@/lib/db/providers'

export type LocalProviderConfig = {
  baseUrl?: string
  model?: string
  embeddingModel?: string
}

export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
export const DEFAULT_MODEL = 'llama3'
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text-v1.5'

export function parseLocalProviderConfig(provider: Provider): LocalProviderConfig {
  if (!provider.config) return {}
  try {
    return JSON.parse(provider.config) as LocalProviderConfig
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Refactor `localComplete` to use the shared helper**

In `lib/router/localComplete.ts`:
- Replace local `parseConfig` with `import { parseLocalProviderConfig as parseConfig, DEFAULT_BASE_URL, DEFAULT_MODEL } from './providerConfig'`.
- Existing `getLocalModelName(provider)` becomes one line: `return parseConfig(provider).model ?? DEFAULT_MODEL`.
- All other behavior unchanged.

- [ ] **Step 5: Implement `localEmbed`**

Create `lib/router/localEmbed.ts`:

```ts
import type { Provider } from '@/lib/db/providers'
import { parseLocalProviderConfig, DEFAULT_BASE_URL, DEFAULT_EMBEDDING_MODEL } from './providerConfig'

export type LocalEmbedOpts = { timeoutMs: number }

export function getLocalEmbeddingModel(provider: Provider): string {
  return parseLocalProviderConfig(provider).embeddingModel ?? DEFAULT_EMBEDDING_MODEL
}

export async function localEmbed(
  provider: Provider,
  inputs: string[],
  opts: LocalEmbedOpts,
): Promise<{ embeddings: Float32Array[]; model: string; dim: number }> {
  const cfg = parseLocalProviderConfig(provider)
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODEL

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: inputs }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`localEmbed: HTTP ${res.status}`)
    const json = await res.json() as { data: Array<{ embedding: number[] }>; model: string }
    if (!json.data || json.data.length === 0) throw new Error('localEmbed: empty data')
    const embeddings = json.data.map(d => Float32Array.from(d.embedding))
    return { embeddings, model: json.model ?? model, dim: embeddings[0].length }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 6: Run tests**

```
npx vitest run tests/router/localEmbed.test.ts
npx vitest run
```

Expected: 4 new passing; full suite still green.

- [ ] **Step 7: Commit**

```
git add lib/router/providerConfig.ts lib/router/localComplete.ts lib/router/localEmbed.ts tests/router/localEmbed.test.ts
git commit -m "feat(reflective): extract providerConfig + add localEmbed (llama.cpp /v1/embeddings)"
```

---

## Task 3: Job runner + scheduler + `lib/jobs/config.ts`

**Files:**
- Create: `lib/jobs/config.ts`
- Create: `lib/jobs/runner.ts` (enqueueJob, runOneBatch, startScheduler)
- Create: `tests/jobs/runner.test.ts`

Handlers come in later tasks. This task ships the queue + scheduler with NO handlers wired — it can claim and dispatch but to a registered handler map; if no handler is registered for a kind, the runner marks the job `failed` immediately to avoid retry storm.

- [ ] **Step 1: Write the failing test**

Create `tests/jobs/runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initDb } from '@/lib/db'
import { enqueueJob, runOneBatch, registerHandler, clearHandlers } from '@/lib/jobs/runner'
import type { Database } from 'better-sqlite3'

let db: Database
beforeEach(() => {
  db = initDb(':memory:')
  clearHandlers()
})

describe('enqueueJob', () => {
  it('inserts a pending row', () => {
    enqueueJob(db, 'embed', { project_id: 'p1', kind: 'doc', ref: 'foo.md', content_hash: 'abc' }, { dedupKey: 'embed:p1:doc:foo.md' })
    const row = db.prepare(`SELECT kind, payload, dedup_key, state FROM pending_jobs`).get() as any
    expect(row.kind).toBe('embed')
    expect(row.state).toBe('pending')
    expect(row.dedup_key).toBe('embed:p1:doc:foo.md')
  })

  it('dedups when same dedup_key already pending', () => {
    enqueueJob(db, 'embed', { x: 1 }, { dedupKey: 'k' })
    enqueueJob(db, 'embed', { x: 2 }, { dedupKey: 'k' })
    const count = (db.prepare(`SELECT count(*) AS c FROM pending_jobs WHERE state = 'pending'`).get() as any).c
    expect(count).toBe(1)
  })

  it('does NOT dedup against done/failed rows', () => {
    enqueueJob(db, 'embed', { x: 1 }, { dedupKey: 'k' })
    db.prepare(`UPDATE pending_jobs SET state = 'done' WHERE dedup_key = 'k'`).run()
    enqueueJob(db, 'embed', { x: 2 }, { dedupKey: 'k' })
    const pending = (db.prepare(`SELECT count(*) AS c FROM pending_jobs WHERE state = 'pending'`).get() as any).c
    expect(pending).toBe(1)
  })
})

describe('runOneBatch', () => {
  it('claims pending and runs registered handler; marks done on success', async () => {
    const handler = vi.fn(async (_db, payload) => { expect(payload).toEqual({ x: 1 }) })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })  // very high cap → never gated
    expect(result.ran).toBe(1)
    expect(handler).toHaveBeenCalledOnce()
    const state = (db.prepare(`SELECT state FROM pending_jobs LIMIT 1`).get() as any).state
    expect(state).toBe('done')
  })

  it('on handler error, increments attempts and backs off', async () => {
    const handler = vi.fn(async () => { throw new Error('boom') })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, attempts, last_error FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.last_error).toBe('boom')
  })

  it('parks after 3 attempts', async () => {
    const handler = vi.fn(async () => { throw new Error('boom') })
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    // Manually fast-forward attempts
    db.prepare(`UPDATE pending_jobs SET attempts = 2`).run()
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, attempts FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('failed')
    expect(row.attempts).toBe(3)
  })

  it('marks job failed when no handler registered', async () => {
    enqueueJob(db, 'embed', { x: 1 })
    await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    const row = db.prepare(`SELECT state, last_error FROM pending_jobs LIMIT 1`).get() as any
    expect(row.state).toBe('failed')
    expect(row.last_error).toMatch(/no handler/i)
  })

  it('skips when loadavg above threshold', async () => {
    const handler = vi.fn()
    registerHandler('embed', handler as any)
    enqueueJob(db, 'embed', { x: 1 })
    // loadAverageMax: 0 forces gate to fire
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 0 })
    expect(result.ran).toBe(0)
    expect(result.skipped).toBe('idle')
    expect(handler).not.toHaveBeenCalled()
  })

  it('respects batchSize cap', async () => {
    const handler = vi.fn(async () => {})
    registerHandler('embed', handler as any)
    for (let i = 0; i < 10; i++) enqueueJob(db, 'embed', { i })
    const result = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    expect(result.ran).toBe(4)
    expect(handler).toHaveBeenCalledTimes(4)
  })
})
```

- [ ] **Step 2: Run test, verify FAIL**

```
npx vitest run tests/jobs/runner.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement `lib/jobs/config.ts`**

```ts
import os from 'os'

export const JOB_CONFIG = {
  intervalMs:     Number(process.env.JOB_INTERVAL_MS ?? 15_000),
  batchSize:      Number(process.env.JOB_BATCH_SIZE ?? 4),
  loadAverageMax: Number(process.env.JOB_LOAD_MAX ?? Math.max(1, os.cpus().length * 0.8)),
}
```

- [ ] **Step 4: Implement `lib/jobs/runner.ts`**

```ts
import os from 'os'
import type { Database } from 'better-sqlite3'

export type JobKind =
  | 'embed'
  | 'grade_session'
  | 'extract_next_actions'
  | 'critique_spec'
  | 'critique_plan'
  | 'refresh_prep'

export type JobHandler = (db: Database, payload: unknown) => Promise<void>

const handlers = new Map<JobKind, JobHandler>()

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers.set(kind, handler)
}

export function clearHandlers(): void {
  handlers.clear()
}

export function enqueueJob(
  db: Database,
  kind: JobKind,
  payload: unknown,
  opts?: { dedupKey?: string },
): void {
  if (opts?.dedupKey) {
    const existing = db.prepare(
      `SELECT 1 FROM pending_jobs WHERE dedup_key = ? AND state = 'pending' LIMIT 1`
    ).get(opts.dedupKey)
    if (existing) return
  }
  db.prepare(
    `INSERT INTO pending_jobs (kind, payload, dedup_key, state, scheduled_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(kind, JSON.stringify(payload), opts?.dedupKey ?? null, new Date().toISOString())
}

export async function runOneBatch(
  db: Database,
  opts: { batchSize: number; loadAverageMax: number },
): Promise<{ ran: number; skipped: 'idle' | 'none' }> {
  const load = os.loadavg()[0]
  if (load > opts.loadAverageMax) return { ran: 0, skipped: 'idle' }

  const now = new Date().toISOString()
  const claimed = db.prepare(
    `SELECT id, kind, payload, attempts FROM pending_jobs
     WHERE state = 'pending' AND scheduled_at <= ?
     ORDER BY scheduled_at ASC LIMIT ?`
  ).all(now, opts.batchSize) as Array<{ id: number; kind: JobKind; payload: string; attempts: number }>

  if (claimed.length === 0) return { ran: 0, skipped: 'none' }

  // Mark as running
  const ids = claimed.map(c => c.id)
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(
    `UPDATE pending_jobs SET state = 'running', started_at = ? WHERE id IN (${placeholders})`
  ).run(now, ...ids)

  // Dispatch in parallel
  await Promise.all(claimed.map(async (job) => {
    const handler = handlers.get(job.kind)
    if (!handler) {
      db.prepare(`UPDATE pending_jobs SET state = 'failed', last_error = ?, finished_at = ? WHERE id = ?`)
        .run(`no handler registered for kind '${job.kind}'`, new Date().toISOString(), job.id)
      return
    }
    try {
      const payload = JSON.parse(job.payload)
      await handler(db, payload)
      db.prepare(`UPDATE pending_jobs SET state = 'done', finished_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), job.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const newAttempts = job.attempts + 1
      if (newAttempts >= 3) {
        db.prepare(`UPDATE pending_jobs SET state = 'failed', attempts = ?, last_error = ?, finished_at = ? WHERE id = ?`)
          .run(newAttempts, msg, new Date().toISOString(), job.id)
        console.warn(`[jobs] parked ${job.kind} #${job.id} after 3 attempts: ${msg}`)
      } else {
        const backoffMs = 60_000 * Math.pow(2, newAttempts - 1)
        const next = new Date(Date.now() + backoffMs).toISOString()
        db.prepare(`UPDATE pending_jobs SET state = 'pending', attempts = ?, last_error = ?, scheduled_at = ?, started_at = NULL WHERE id = ?`)
          .run(newAttempts, msg, next, job.id)
        console.warn(`[jobs] retry ${job.kind} #${job.id} in ${backoffMs}ms: ${msg}`)
      }
    }
  }))

  return { ran: claimed.length, skipped: 'none' }
}

export function startScheduler(opts: { intervalMs: number; batchSize: number; loadAverageMax: number; getDb: () => Database }): { stop: () => void } {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      await runOneBatch(opts.getDb(), { batchSize: opts.batchSize, loadAverageMax: opts.loadAverageMax })
    } catch (err) {
      console.warn('[jobs] tick error:', err)
    }
  }
  const handle = setInterval(tick, opts.intervalMs)
  return {
    stop: () => {
      stopped = true
      clearInterval(handle)
    },
  }
}
```

- [ ] **Step 5: Run tests**

```
npx vitest run tests/jobs/runner.test.ts
npx vitest run
```

Expected: 7 new + prior all passing.

- [ ] **Step 6: Commit**

```
git add lib/jobs tests/jobs
git commit -m "feat(reflective): job queue + scheduler with dedup_key + loadavg gating"
```

---

## Task 4: Embed handler + content loader + search

**Files:**
- Create: `lib/embeddings/loadContent.ts`
- Create: `lib/embeddings/search.ts`
- Create: `lib/jobs/handlers/embed.ts`
- Create: `tests/embeddings/search.test.ts`
- Create: `tests/jobs/handlers/embed.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/embeddings/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { findSimilar } from '@/lib/embeddings/search'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'

function insertEmbedding(db, project_id, kind, ref, vector: number[], model = 'm', dim?: number) {
  const arr = Float32Array.from(vector)
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
  db.prepare(`INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(project_id, kind, ref, 'h', buf, dim ?? vector.length, model, new Date().toISOString())
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
    expect(result.map(r => r.ref)).toEqual(['a.md', 'b.md', 'c.md'])
    expect(result[0].score).toBeCloseTo(1.0, 3)
  })

  it('filters out rows with different model', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    insertEmbedding(db, p, 'doc', 'a.md', [1, 0, 0], 'modelA')
    insertEmbedding(db, p, 'doc', 'b.md', [1, 0, 0], 'modelB')
    const result = findSimilar(db, {
      projectId: p, queryVector: Float32Array.from([1, 0, 0]),
      queryDim: 3, queryModel: 'modelA', kinds: ['doc'],
    })
    expect(result.map(r => r.ref)).toEqual(['a.md'])
  })

  it('respects excludeRef', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    insertEmbedding(db, p, 'doc', 'a.md', [1, 0])
    insertEmbedding(db, p, 'doc', 'b.md', [1, 0])
    const result = findSimilar(db, {
      projectId: p, queryVector: Float32Array.from([1, 0]),
      queryDim: 2, queryModel: 'm', kinds: ['doc'], excludeRef: 'a.md',
    })
    expect(result.map(r => r.ref)).toEqual(['b.md'])
  })

  it('respects limit', () => {
    const db = initDb(':memory:')
    const p = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    for (let i = 0; i < 10; i++) insertEmbedding(db, p, 'doc', `${i}.md`, [1, 0])
    const result = findSimilar(db, {
      projectId: p, queryVector: Float32Array.from([1, 0]),
      queryDim: 2, queryModel: 'm', kinds: ['doc'], limit: 3,
    })
    expect(result).toHaveLength(3)
  })
})
```

Create `tests/jobs/handlers/embed.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'
import { writeFileSync, mkdtempSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import os from 'os'

vi.mock('@/lib/router/localEmbed', () => ({
  localEmbed: vi.fn(async () => ({
    embeddings: [Float32Array.from([0.1, 0.2, 0.3])],
    model: 'mock-embed',
    dim: 3,
  })),
}))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return {
    ...actual,
    getDefaultLocalProvider: () => ({ id: 'p', name: 'Local', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }),
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

    const row = db.prepare(`SELECT * FROM embeddings WHERE project_id = ? AND ref = ?`)
      .get(projectId, 'docs/a.md') as any
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
      project_id: projectId, kind: 'doc', ref: 'docs/a.md', content_hash: 'old-hash',
    })
    const row = db.prepare(`SELECT * FROM embeddings WHERE ref = ?`).get('docs/a.md')
    expect(row).toBeUndefined()
  })

  it('marks done when file does not exist (ENOENT)', async () => {
    const db = initDb(':memory:')
    const tmpDir = mkdtempSync(join(os.tmpdir(), 'embed-test-'))
    const projectId = createProject(db, { name: 'P', path: tmpDir })
    // Should NOT throw
    await expect(handleEmbed(db, {
      project_id: projectId, kind: 'doc', ref: 'docs/missing.md', content_hash: 'h',
    })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement `lib/embeddings/loadContent.ts`**

```ts
import fs from 'fs'
import path from 'path'
import type { Database } from 'better-sqlite3'

export type EmbedKind = 'doc' | 'spec' | 'plan' | 'session_summary' | 'task'

export function loadContent(db: Database, projectId: string, kind: EmbedKind, ref: string): string | null {
  if (kind === 'doc' || kind === 'spec' || kind === 'plan') {
    const project = db.prepare(`SELECT path FROM projects WHERE id = ?`).get(projectId) as { path: string } | undefined
    if (!project) return null
    const filePath = path.join(project.path, ref)
    try {
      return fs.readFileSync(filePath, 'utf8')
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
  if (kind === 'session_summary') {
    const row = db.prepare(`SELECT summary FROM sessions WHERE id = ?`).get(ref) as { summary: string | null } | undefined
    return row?.summary ?? null
  }
  if (kind === 'task') {
    const row = db.prepare(`SELECT title, idea_file FROM tasks WHERE id = ?`).get(ref) as { title: string; idea_file: string | null } | undefined
    if (!row) return null
    const desc = row.idea_file?.replace(/^file:\/\//, '') ?? ''
    return `${row.title}\n${desc}`
  }
  return null
}
```

- [ ] **Step 4: Implement `lib/embeddings/search.ts`**

```ts
import type { Database } from 'better-sqlite3'

export type SimilarMatch = { kind: string; ref: string; score: number }

export function findSimilar(db: Database, opts: {
  projectId: string
  queryVector: Float32Array
  queryDim: number
  queryModel: string
  kinds?: string[]
  limit?: number
  excludeRef?: string
}): SimilarMatch[] {
  const kinds = opts.kinds ?? ['doc', 'spec', 'plan', 'session_summary', 'task']
  const placeholders = kinds.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT kind, ref, vector FROM embeddings
     WHERE project_id = ? AND model = ? AND dim = ? AND kind IN (${placeholders})
       ${opts.excludeRef ? 'AND ref != ?' : ''}`
  ).all(opts.projectId, opts.queryModel, opts.queryDim, ...kinds, ...(opts.excludeRef ? [opts.excludeRef] : [])) as Array<{ kind: string; ref: string; vector: Buffer }>

  // Pre-compute query norm
  const qNorm = Math.sqrt(opts.queryVector.reduce((s, x) => s + x * x, 0))
  if (qNorm === 0) return []

  const scored: SimilarMatch[] = rows.map(row => {
    const buf = row.vector
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    let dot = 0
    let vNorm = 0
    for (let i = 0; i < opts.queryDim; i++) {
      dot += opts.queryVector[i] * v[i]
      vNorm += v[i] * v[i]
    }
    const score = vNorm > 0 ? dot / (qNorm * Math.sqrt(vNorm)) : 0
    return { kind: row.kind, ref: row.ref, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, opts.limit ?? 10)
}
```

- [ ] **Step 5: Implement `lib/jobs/handlers/embed.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { createHash } from 'crypto'
import { loadContent, type EmbedKind } from '@/lib/embeddings/loadContent'
import { localEmbed, getLocalEmbeddingModel } from '@/lib/router/localEmbed'
import { getDefaultLocalProvider } from '@/lib/db/providers'

export type EmbedPayload = {
  project_id: string
  kind: EmbedKind
  ref: string
  content_hash: string
}

export async function handleEmbed(db: Database, payload: EmbedPayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[embed] no local provider configured; skipping')
    return
  }

  const content = loadContent(db, payload.project_id, payload.kind, payload.ref)
  if (content === null) {
    console.warn(`[embed] content not found for ${payload.kind}:${payload.ref}; skipping`)
    return
  }

  const currentHash = createHash('sha256').update(content).digest('hex')
  if (currentHash !== payload.content_hash) {
    console.warn(`[embed] content_hash drift for ${payload.kind}:${payload.ref}; skipping (next trigger will re-enqueue)`)
    return
  }

  const { embeddings, model, dim } = await localEmbed(provider, [content], { timeoutMs: 30_000 })
  const vec = embeddings[0]
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength)

  db.prepare(`
    INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, kind, ref) DO UPDATE SET
      content_hash = excluded.content_hash,
      vector = excluded.vector,
      dim = excluded.dim,
      model = excluded.model,
      updated_at = excluded.updated_at
  `).run(payload.project_id, payload.kind, payload.ref, currentHash, buf, dim, model, new Date().toISOString())
}
```

Note: the function name is `handleEmbed` (exported). Registration happens in a later task.

- [ ] **Step 6: Run tests, commit**

```
npx vitest run tests/embeddings/search.test.ts tests/jobs/handlers/embed.test.ts
npx vitest run
```

Expected: 4 search + 3 embed = 7 new + prior all passing.

```
git add lib/embeddings lib/jobs/handlers/embed.ts tests/embeddings tests/jobs/handlers/embed.test.ts
git commit -m "feat(reflective): embed handler + cosine similarity search"
```

---

## Task 5: Grader handler + next-actions handler + refresh-prep handler + taskMatchesPath

**Files:**
- Create: `lib/prep/taskMatchesPath.ts`
- Create: `lib/jobs/handlers/grade_session.ts`
- Create: `lib/jobs/handlers/extract_next_actions.ts`
- Create: `lib/jobs/handlers/refresh_prep.ts`
- Create: `tests/prep/taskMatchesPath.test.ts`
- Create: `tests/jobs/handlers/grade_session.test.ts`
- Create: `tests/jobs/handlers/extract_next_actions.test.ts`
- Create: `tests/jobs/handlers/refresh_prep.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/prep/taskMatchesPath.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { taskMatchesPath } from '@/lib/prep/taskMatchesPath'
import type { Task } from '@/lib/db/tasks'

const baseTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1', project_id: 'p1', title: 'T', status: 'idea', priority: 'medium',
  idea_file: null, spec_file: null, plan_file: null, session_log: null,
  source: null, source_id: null, source_url: null, source_meta: null,
  labels: null, complexity: null, complexity_overridden: 0,
  prep_notes: null, prep_status: null, prepped_at: null,
  is_deleted: 0, created_at: '', updated_at: '',
  ...overrides,
})

describe('taskMatchesPath', () => {
  it('matches when idea_file equals path (exact)', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'specs/foo.md' }), 'specs/foo.md')).toBe(true)
  })
  it('strips file:// prefix from idea_file before comparing', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'file://specs/foo.md' }), 'specs/foo.md')).toBe(true)
  })
  it('strips ./ from path before comparing', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'specs/foo.md' }), './specs/foo.md')).toBe(true)
  })
  it('does NOT substring-match', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'lib/auth.ts' }), 'lib/authorize.ts')).toBe(false)
  })
  it('falls back to prep_notes.files[] when idea_file is null', () => {
    const task = baseTask({
      idea_file: null,
      prep_notes: JSON.stringify({ files: [{ path: 'lib/a.ts', why: 'x' }] }),
    })
    expect(taskMatchesPath(task, 'lib/a.ts')).toBe(true)
  })
  it('returns false when neither idea_file nor prep_notes match', () => {
    expect(taskMatchesPath(baseTask({ idea_file: 'a.md' }), 'b.md')).toBe(false)
  })
})
```

`tests/jobs/handlers/grade_session.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return {
    ...actual,
    getDefaultLocalProvider: () => ({ id: 'p', name: 'Local', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }),
  }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleGradeSession } from '@/lib/jobs/handlers/grade_session'

let db: Database
let sessionId: string
let taskId: string
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'Build feature' })
  sessionId = randomUUID()
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, status, created_at, ended_at, summary)
              VALUES (?, ?, ?, ?, ?, ?, 'ended', ?, ?, ?)`)
    .run(sessionId, projectId, 'L', 'spec', null, taskId, new Date().toISOString(), new Date().toISOString(), 'finished the work')
  // Insert a routing decision for this session
  db.prepare(`INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('d1', sessionId, taskId, 'pickedProv', 'spec', 'normal', '{}', new Date().toISOString())
  vi.mocked(localComplete).mockReset()
})

describe('grade_session handler', () => {
  it('writes grade + reason and records routing outcome on success', async () => {
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "yes", "reason": "shipped what was asked" }')
    await handleGradeSession(db, { session_id: sessionId })
    const row = db.prepare(`SELECT grade, grade_reason, graded_at FROM sessions WHERE id = ?`).get(sessionId) as any
    expect(row.grade).toBe('yes')
    expect(row.grade_reason).toBe('shipped what was asked')
    expect(row.graded_at).toBeTruthy()
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = ?`).get('d1') as any
    expect(outcome.outcome).toBe('success')
  })

  it('partial grade maps to partial outcome', async () => {
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "partial", "reason": "did half" }')
    await handleGradeSession(db, { session_id: sessionId })
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = ?`).get('d1') as any
    expect(outcome.outcome).toBe('partial')
  })

  it('throws on malformed JSON (lets runner retry)', async () => {
    vi.mocked(localComplete).mockResolvedValue('not json')
    await expect(handleGradeSession(db, { session_id: sessionId })).rejects.toThrow()
  })

  it('skips routing update when no decision exists for the session', async () => {
    db.prepare(`DELETE FROM routing_decisions WHERE session_id = ?`).run(sessionId)
    vi.mocked(localComplete).mockResolvedValue('{ "grade": "yes", "reason": "x" }')
    await handleGradeSession(db, { session_id: sessionId })
    const row = db.prepare(`SELECT grade FROM sessions WHERE id = ?`).get(sessionId) as any
    expect(row.grade).toBe('yes')  // grade still written
  })
})
```

`tests/jobs/handlers/extract_next_actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask, updateTask } from '@/lib/db/tasks'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn() }))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: () => ({ id: 'p', name: 'L', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }) }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleExtractNextActions } from '@/lib/jobs/handlers/extract_next_actions'

let db: Database
let sessionId: string
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  sessionId = randomUUID()
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
              VALUES (?, ?, ?, ?, ?, 'ended', ?, ?, ?)`)
    .run(sessionId, projectId, 'L', 'spec', null, new Date().toISOString(), new Date().toISOString(), 'fixed login redirect')
  vi.mocked(localComplete).mockReset()
})

describe('extract_next_actions handler', () => {
  it('writes structured next_actions to the session', async () => {
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({
      next_actions: ['add unit test for redirect', 'document the fix'],
      open_questions: ['should we add CSRF?'],
      files_touched: [{ path: 'lib/auth.ts', change: 'fixed redirect loop' }],
    }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const row = db.prepare(`SELECT next_actions FROM sessions WHERE id = ?`).get(sessionId) as { next_actions: string }
    const parsed = JSON.parse(row.next_actions)
    expect(parsed.next_actions).toHaveLength(2)
    expect(parsed.open_questions).toHaveLength(1)
    expect(parsed.files_touched[0].path).toBe('lib/auth.ts')
    expect(parsed.extracted_at).toBeTruthy()
  })

  it('enqueues refresh_prep for tasks matching files_touched', async () => {
    const t1 = randomUUID()
    createTask(db, { id: t1, projectId, title: 'Auth task' })
    updateTask(db, t1, { idea_file: 'lib/auth.ts' })
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({
      next_actions: [], open_questions: [],
      files_touched: [{ path: 'lib/auth.ts', change: 'x' }],
    }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const job = db.prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'refresh_prep'`).get() as any
    expect(job.kind).toBe('refresh_prep')
    expect(job.dedup_key).toBe(`refresh_prep:${t1}`)
  })

  it('enqueues an embed job for the session_summary', async () => {
    vi.mocked(localComplete).mockResolvedValue(JSON.stringify({ next_actions: [], open_questions: [], files_touched: [] }))
    await handleExtractNextActions(db, { session_id: sessionId })
    const job = db.prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'embed'`).get() as any
    expect(job.kind).toBe('embed')
    expect(job.dedup_key).toBe(`embed:${projectId}:session_summary:${sessionId}`)
  })

  it('throws on malformed JSON (lets runner retry)', async () => {
    vi.mocked(localComplete).mockResolvedValue('not json')
    await expect(handleExtractNextActions(db, { session_id: sessionId })).rejects.toThrow()
  })
})
```

`tests/jobs/handlers/refresh_prep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

const prepareTaskMock = vi.fn(async () => undefined)
vi.mock('@/lib/prep/prepareTask', () => ({ prepareTask: prepareTaskMock }))

import { handleRefreshPrep } from '@/lib/jobs/handlers/refresh_prep'

let db: Database
beforeEach(() => { db = initDb(':memory:'); prepareTaskMock.mockReset() })

describe('refresh_prep handler', () => {
  it('calls prepareTask with the supplied taskId', async () => {
    await handleRefreshPrep(db, { task_id: 'task-42' })
    expect(prepareTaskMock).toHaveBeenCalledWith(db, 'task-42')
  })
})
```

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement `lib/prep/taskMatchesPath.ts`**

```ts
import type { Task } from '@/lib/db/tasks'

function normalize(p: string): string {
  let n = p.trim()
  if (n.startsWith('./')) n = n.slice(2)
  return n
}

export function taskMatchesPath(task: Task, path: string): boolean {
  const target = normalize(path)
  const idea = task.idea_file
  if (idea) {
    const stripped = idea.replace(/^file:\/\//, '')
    if (normalize(stripped) === target) return true
    return false  // when idea_file is set, it's the canonical signal — don't fall back
  }
  if (task.prep_notes) {
    try {
      const notes = JSON.parse(task.prep_notes) as { files?: Array<{ path: string }> }
      const files = notes.files ?? []
      if (files.some(f => normalize(f.path) === target)) return true
    } catch {
      // malformed prep_notes → no match
    }
  }
  return false
}
```

- [ ] **Step 4: Implement `lib/jobs/handlers/grade_session.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { localComplete } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router/recordOutcome'
import type { Outcome } from '@/lib/router/types'

export type GradeSessionPayload = { session_id: string }

const PROMPT = (taskTitle: string, goal: string, phase: string, summary: string) => `
Task: ${taskTitle}
Goal: ${goal}
Phase: ${phase}

Agent's final summary:
${summary}

---

Question: Did the agent achieve the task's goal in this session?
Respond with EXACTLY one JSON object, no preamble:
{ "grade": "yes" | "partial" | "no", "reason": "<one sentence>" }
`.trim()

const GRADE_TO_OUTCOME: Record<'yes' | 'partial' | 'no', Outcome> = {
  yes: 'success',
  partial: 'partial',
  no: 'failure',
}

export async function handleGradeSession(db: Database, payload: GradeSessionPayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[grade_session] no local provider; skipping')
    return
  }

  const session = db.prepare(`SELECT id, summary, phase, task_id FROM sessions WHERE id = ?`).get(payload.session_id) as
    { id: string; summary: string | null; phase: string; task_id: string | null } | undefined
  if (!session || !session.summary || !session.task_id) {
    console.warn(`[grade_session] missing session/summary/task_id for ${payload.session_id}`)
    return
  }

  const task = db.prepare(`SELECT title, idea_file FROM tasks WHERE id = ?`).get(session.task_id) as
    { title: string; idea_file: string | null } | undefined
  if (!task) return

  const goal = task.idea_file?.replace(/^file:\/\//, '') ?? '(no description)'
  const prompt = PROMPT(task.title, goal, session.phase, session.summary)

  const raw = await localComplete(provider, prompt, { maxTokens: 200, timeoutMs: 30_000 })
  const parsed = JSON.parse(raw) as { grade: 'yes' | 'partial' | 'no'; reason: string }
  if (!['yes', 'partial', 'no'].includes(parsed.grade)) {
    throw new Error(`grade_session: invalid grade '${parsed.grade}'`)
  }

  db.prepare(`UPDATE sessions SET grade = ?, grade_reason = ?, graded_at = ? WHERE id = ?`)
    .run(parsed.grade, parsed.reason, new Date().toISOString(), session.id)

  // Update router success-rate
  const decision = db.prepare(`SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(session.id) as { id: string } | undefined
  if (decision) {
    recordOutcome(db, { decisionId: decision.id, outcome: GRADE_TO_OUTCOME[parsed.grade] })
  }
}
```

- [ ] **Step 5: Implement `lib/jobs/handlers/extract_next_actions.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { localComplete } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { getTasksByProject } from '@/lib/db/tasks'
import { taskMatchesPath } from '@/lib/prep/taskMatchesPath'
import { enqueueJob } from '@/lib/jobs/runner'

export type ExtractNextActionsPayload = { session_id: string }

const PROMPT = (summary: string) => `
You are extracting structured next-steps from a coding agent's wrap-up message.
Return a JSON object with EXACTLY this shape, no preamble:

{
  "next_actions": ["short action sentence", ...],
  "open_questions": ["short question", ...],
  "files_touched": [{ "path": "<relative>", "change": "<one-line description>" }, ...]
}

Rules:
- Each next_action is one concrete step. 0-5 entries.
- Each open_question is one ambiguity. 0-3 entries.
- files_touched lists files modified or created with one-line descriptions. 0-20 entries.
- If a section has no entries, return an empty array.
- Use exact relative paths as the agent wrote them.

Agent's final summary:
${summary}
`.trim()

export async function handleExtractNextActions(db: Database, payload: ExtractNextActionsPayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[extract_next_actions] no local provider; skipping')
    return
  }

  const session = db.prepare(`SELECT id, project_id, summary FROM sessions WHERE id = ?`).get(payload.session_id) as
    { id: string; project_id: string; summary: string | null } | undefined
  if (!session || !session.summary) return

  const raw = await localComplete(provider, PROMPT(session.summary), { maxTokens: 1000, timeoutMs: 20_000 })
  const parsed = JSON.parse(raw) as {
    next_actions?: string[]
    open_questions?: string[]
    files_touched?: Array<{ path: string; change: string }>
  }
  const result = {
    next_actions: parsed.next_actions ?? [],
    open_questions: parsed.open_questions ?? [],
    files_touched: parsed.files_touched ?? [],
    extracted_at: new Date().toISOString(),
    model: 'local',
  }

  db.prepare(`UPDATE sessions SET next_actions = ? WHERE id = ?`)
    .run(JSON.stringify(result), session.id)

  // Trigger refresh_prep for matching tasks
  const tasks = getTasksByProject(db, session.project_id)
  for (const file of result.files_touched) {
    for (const t of tasks) {
      if (taskMatchesPath(t, file.path)) {
        enqueueJob(db, 'refresh_prep', { task_id: t.id }, { dedupKey: `refresh_prep:${t.id}` })
      }
    }
  }

  // Enqueue session_summary embedding
  const { createHash } = await import('crypto')
  const hash = createHash('sha256').update(session.summary).digest('hex')
  enqueueJob(db, 'embed',
    { project_id: session.project_id, kind: 'session_summary', ref: session.id, content_hash: hash },
    { dedupKey: `embed:${session.project_id}:session_summary:${session.id}` }
  )
}
```

- [ ] **Step 6: Implement `lib/jobs/handlers/refresh_prep.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { prepareTask } from '@/lib/prep/prepareTask'

export type RefreshPrepPayload = { task_id: string }

export async function handleRefreshPrep(db: Database, payload: RefreshPrepPayload): Promise<void> {
  await prepareTask(db, payload.task_id)
}
```

- [ ] **Step 7: Run all new tests + full suite**

- [ ] **Step 8: Commit**

```
git add lib/prep/taskMatchesPath.ts lib/jobs/handlers tests/prep tests/jobs/handlers
git commit -m "feat(reflective): grader + next-actions + refresh-prep handlers + taskMatchesPath"
```

---

## Task 6: Critic ensemble handler

**Files:**
- Create: `lib/jobs/handlers/critique.ts` (handles both `critique_spec` and `critique_plan`)
- Create: `tests/jobs/handlers/critique.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { writeFileSync, mkdirSync, mkdtempSync } from 'fs'
import { join } from 'path'
import os from 'os'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn() }))
vi.mock('@/lib/db/providers', async (o) => {
  const actual = await o<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: () => ({ id: 'p', name: 'L', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }) }
})

import { localComplete } from '@/lib/router/localComplete'
import { handleCritique } from '@/lib/jobs/handlers/critique'

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
```

- [ ] **Step 2: Implement `lib/jobs/handlers/critique.ts`**

```ts
import type { Database } from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { localComplete, getLocalModelName } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'

export type CritiquePayload = {
  project_id: string
  ref: string                  // relative path
  kind: 'spec' | 'plan'
  content_hash: string
}

type Issue = {
  severity: 'critical' | 'important' | 'minor'
  category: string
  message: string
  line_hint?: number | null
}

const PROMPT = (kind: 'spec' | 'plan', content: string) => `
You are reviewing a ${kind} document. Identify issues using this rubric:

CRITICAL (block ship):
- Placeholder text ("TODO", "TBD", "fill in")
- Internal contradictions
- Missing required sections (Goal, Architecture, Failure modes for specs; Tasks, Steps, Tests for plans)
- Type/property/file-path drift between sections

IMPORTANT (should fix):
- Ambiguity an implementer would interpret two ways
- Tests that don't actually pin the claimed behavior
- Missing prerequisites between tasks

MINOR:
- Style inconsistencies
- Unclear naming

Return ONLY a JSON object:
{
  "issues": [
    { "severity": "critical" | "important" | "minor", "category": "<short tag>", "message": "<one sentence>", "line_hint": <line number or null> }
  ]
}

Document:
${content}
`.trim()

function dedupKeyForIssue(issue: Issue): string {
  return `${issue.severity}|${issue.category}|${issue.message.slice(0, 50)}`
}

export async function handleCritique(db: Database, payload: CritiquePayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) { console.warn('[critique] no local provider'); return }

  const project = db.prepare(`SELECT path FROM projects WHERE id = ?`).get(payload.project_id) as { path: string } | undefined
  if (!project) return
  const filePath = join(project.path, payload.ref)
  let content: string
  try { content = readFileSync(filePath, 'utf8') } catch { console.warn(`[critique] file gone: ${filePath}`); return }
  const currentHash = createHash('sha256').update(content).digest('hex')
  if (currentHash !== payload.content_hash) { console.warn('[critique] hash drift; skipping'); return }

  const prompt = PROMPT(payload.kind, content)
  const issuesByKey = new Map<string, { issue: Issue; votes: number }>()

  const temps = [0.0, 0.2, 0.4]
  let successfulRuns = 0
  for (const _t of temps) {
    try {
      const raw = await localComplete(provider, prompt, { maxTokens: 2000, timeoutMs: 60_000 })
      const parsed = JSON.parse(raw) as { issues?: Issue[] }
      successfulRuns++
      for (const issue of parsed.issues ?? []) {
        const key = dedupKeyForIssue(issue)
        const existing = issuesByKey.get(key)
        if (existing) existing.votes++
        else issuesByKey.set(key, { issue, votes: 1 })
      }
    } catch (err) {
      console.warn(`[critique] run failed:`, err)
    }
  }

  if (successfulRuns === 0) throw new Error('critique: all runs failed')

  // Majority vote: issues with votes >= 2 (or >= 1 if only one run succeeded)
  const minVotes = successfulRuns >= 2 ? 2 : 1
  const merged: Issue[] = Array.from(issuesByKey.values())
    .filter(e => e.votes >= minVotes)
    .map(e => e.issue)

  const findings = {
    issues: merged,
    votes: successfulRuns,
    model: getLocalModelName(provider),
    run_at: new Date().toISOString(),
  }

  db.prepare(`
    INSERT INTO critic_findings (project_id, kind, ref, content_hash, findings, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, kind, ref) DO UPDATE SET
      content_hash = excluded.content_hash,
      findings = excluded.findings,
      created_at = excluded.created_at
  `).run(payload.project_id, payload.kind, payload.ref, currentHash, JSON.stringify(findings), new Date().toISOString())
}
```

- [ ] **Step 3: Run tests + commit**

```
git add lib/jobs/handlers/critique.ts tests/jobs/handlers/critique.test.ts
git commit -m "feat(reflective): critic ensemble (3-pass majority vote) for specs and plans"
```

---

## Task 7: Wire triggers + handler registration + scheduler startup

**Files:**
- Create: `lib/jobs/triggers/onDocsTreeRead.ts`
- Create: `lib/jobs/registerAll.ts` (one-line file: registers all handlers from Tasks 4-6)
- Modify: `lib/session-manager.ts` (enqueue grade + extract jobs after captureSummary)
- Modify: `app/api/projects/[id]/docs/route.ts` (call onDocsTreeRead after response)
- Modify: `lib/db/tasks.ts` `createTask` / `updateTask` (enqueue task embed on title/desc change)
- Modify: `server.ts` (register handlers + start scheduler with sentinel-row guard)

- [ ] **Step 1: Create `lib/jobs/registerAll.ts`**

```ts
import { registerHandler } from './runner'
import { handleEmbed } from './handlers/embed'
import { handleGradeSession } from './handlers/grade_session'
import { handleExtractNextActions } from './handlers/extract_next_actions'
import { handleRefreshPrep } from './handlers/refresh_prep'
import { handleCritique } from './handlers/critique'

export function registerAllHandlers(): void {
  registerHandler('embed', handleEmbed as never)
  registerHandler('grade_session', handleGradeSession as never)
  registerHandler('extract_next_actions', handleExtractNextActions as never)
  registerHandler('refresh_prep', handleRefreshPrep as never)
  registerHandler('critique_spec', (db, payload) => handleCritique(db, { ...(payload as any), kind: 'spec' }))
  registerHandler('critique_plan', (db, payload) => handleCritique(db, { ...(payload as any), kind: 'plan' }))
}
```

- [ ] **Step 2: Create `lib/jobs/triggers/onDocsTreeRead.ts`**

```ts
import { createHash } from 'crypto'
import type { Database } from 'better-sqlite3'
import { enqueueJob } from '@/lib/jobs/runner'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { getLocalEmbeddingModel } from '@/lib/router/localEmbed'

type FileNode = { type: 'file'; relativePath: string; content?: string }
type FolderNode = { type: 'folder'; children?: Array<FileNode | FolderNode> }
type Node = FileNode | FolderNode

function isSpec(p: string): boolean { return p.startsWith('docs/superpowers/specs/') }
function isPlan(p: string): boolean { return p.startsWith('docs/superpowers/plans/') }

function walk(nodes: Node[], cb: (file: FileNode) => void): void {
  for (const n of nodes) {
    if (n.type === 'file') cb(n)
    else if (n.children) walk(n.children, cb)
  }
}

export function onDocsTreeRead(db: Database, projectId: string, nodes: Node[]): void {
  // Compute active embedding model once per call (so we can detect stale-model rows).
  const provider = getDefaultLocalProvider(db)
  const activeModel = provider ? getLocalEmbeddingModel(provider) : null
  if (!activeModel) return  // no provider configured → no point enqueuing embed jobs

  walk(nodes, (file) => {
    if (!file.content) return
    if (!file.relativePath.endsWith('.md') && !file.relativePath.endsWith('.mdx')) return
    const hash = createHash('sha256').update(file.content).digest('hex')
    const kind = isSpec(file.relativePath) ? 'spec' : isPlan(file.relativePath) ? 'plan' : 'doc'

    // Embed enqueue: stale on either content_hash OR model drift
    const existing = db.prepare(`SELECT content_hash, model FROM embeddings WHERE project_id = ? AND kind = ? AND ref = ?`)
      .get(projectId, kind, file.relativePath) as { content_hash: string; model: string } | undefined
    if (!existing || existing.content_hash !== hash || existing.model !== activeModel) {
      enqueueJob(db, 'embed',
        { project_id: projectId, kind, ref: file.relativePath, content_hash: hash },
        { dedupKey: `embed:${projectId}:${kind}:${file.relativePath}` })
    }

    // Critique enqueue: only specs/plans
    if (kind === 'spec' || kind === 'plan') {
      const existingCritic = db.prepare(`SELECT content_hash FROM critic_findings WHERE project_id = ? AND kind = ? AND ref = ?`)
        .get(projectId, kind, file.relativePath) as { content_hash: string } | undefined
      if (!existingCritic || existingCritic.content_hash !== hash) {
        const jobKind = kind === 'spec' ? 'critique_spec' : 'critique_plan'
        enqueueJob(db, jobKind,
          { project_id: projectId, ref: file.relativePath, content_hash: hash },
          { dedupKey: `${jobKind}:${projectId}:${file.relativePath}` })
      }
    }
  })
}
```

- [ ] **Step 3: Hook the trigger into the docs API**

In `app/api/projects/[id]/docs/route.ts`, after the response is constructed but before returning, fire the trigger via `setImmediate`:

```ts
import { onDocsTreeRead } from '@/lib/jobs/triggers/onDocsTreeRead'
// ... existing GET handler builds `responseData` ...
setImmediate(() => {
  try { onDocsTreeRead(getDb(), projectId, responseData.nodes) } catch (e) { console.warn('[docs trigger]', e) }
})
return NextResponse.json(responseData)
```

(Adjust `responseData.nodes` to match the existing variable name; setImmediate ensures the response goes out first.)

- [ ] **Step 4: Hook session-end triggers**

In `lib/session-manager.ts`, immediately after the existing `captureSessionSummary(getDb(), sessionId)` call (around line 460):

```ts
// Reflective workflow: enqueue grade + extract jobs (handlers run in scheduler)
import { enqueueJob } from '@/lib/jobs/runner'
// (add import at top)

const sessionRow = getDb().prepare(`SELECT summary, task_id FROM sessions WHERE id = ?`).get(sessionId) as
  { summary: string | null; task_id: string | null } | undefined
if (sessionRow?.summary) {
  enqueueJob(getDb(), 'extract_next_actions', { session_id: sessionId }, { dedupKey: `extract_next_actions:${sessionId}` })
}
if (sessionRow?.task_id && sessionRow.summary) {
  enqueueJob(getDb(), 'grade_session', { session_id: sessionId }, { dedupKey: `grade_session:${sessionId}` })
}
```

- [ ] **Step 5: Hook task create/update embed trigger**

In `lib/db/tasks.ts`'s `createTask` and `updateTask` (only update when `title` or `idea_file` changes):

```ts
import { enqueueJob } from '@/lib/jobs/runner'
import { createHash } from 'crypto'

// In createTask, after the INSERT:
const desc = task.idea_file?.replace(/^file:\/\//, '') ?? ''
const content = `${task.title}\n${desc}`
const hash = createHash('sha256').update(content).digest('hex')
enqueueJob(db, 'embed', { project_id: task.project_id, kind: 'task', ref: task.id, content_hash: hash },
  { dedupKey: `embed:${task.project_id}:task:${task.id}` })

// In updateTask, after the UPDATE — only if title or idea_file is in the changeset:
if (changes.title !== undefined || changes.idea_file !== undefined) {
  // recompute hash from the new full row
  const updated = db.prepare(`SELECT title, idea_file, project_id FROM tasks WHERE id = ?`).get(id)
  const desc = updated.idea_file?.replace(/^file:\/\//, '') ?? ''
  const content = `${updated.title}\n${desc}`
  const hash = createHash('sha256').update(content).digest('hex')
  enqueueJob(db, 'embed', { project_id: updated.project_id, kind: 'task', ref: id, content_hash: hash },
    { dedupKey: `embed:${updated.project_id}:task:${id}` })
}
```

- [ ] **Step 6: Wire scheduler in `server.ts`**

Add to `server.ts` after existing init code:

```ts
import { startScheduler, registerHandler } from '@/lib/jobs/runner'
import { registerAllHandlers } from '@/lib/jobs/registerAll'
import { JOB_CONFIG } from '@/lib/jobs/config'
import { getDb } from '@/lib/db'

if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
  const g = globalThis as any
  if (!g.__reflectiveSchedulerStarted) {
    g.__reflectiveSchedulerStarted = true
    registerAllHandlers()
    const sch = startScheduler({ ...JOB_CONFIG, getDb })
    // server.ts already has a `shutdown()` function bound to SIGTERM and SIGINT
    // (see lines 36-41 of the existing file). Integrate scheduler.stop() into it
    // rather than registering a separate listener: locate the existing `shutdown`
    // function, call `sch.stop()` inside it BEFORE `process.exit(0)`.
    console.log('[jobs] scheduler started')
  }
}
```

- [ ] **Step 7: Skip the one-time sweep — lazy is enough**

The spec mentioned a sentinel-row gate for a one-time index sweep. After review, we drop this entirely: the docs-tree-read trigger (Step 2) populates the embedding index lazily on first visit to each project's docs page. Any user opening the Docs page once warms the index; users who never visit have no index but also no UI surface using it. No sentinel, no eager walk. The spec's risk-acceptance for this is updated implicitly — first-render of similar-sessions on a never-visited project shows empty until the user opens Docs once.

- [ ] **Step 8: Add the integration test for the full pipeline**

Create `tests/sessions/grade-and-next-actions-pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { randomUUID } from 'crypto'
import { enqueueJob, runOneBatch, registerHandler, clearHandlers } from '@/lib/jobs/runner'
import { handleGradeSession } from '@/lib/jobs/handlers/grade_session'
import { handleExtractNextActions } from '@/lib/jobs/handlers/extract_next_actions'
import { handleRefreshPrep } from '@/lib/jobs/handlers/refresh_prep'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn() }))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: () => ({ id: 'p', name: 'L', type: 'ollama', command: '', config: '{}', is_active: 1, created_at: '' }) }
})
vi.mock('@/lib/prep/prepareTask', () => ({ prepareTask: vi.fn(async () => undefined) }))

import { localComplete } from '@/lib/router/localComplete'
import { prepareTask } from '@/lib/prep/prepareTask'

let db: Database
let projectId: string
let taskId: string
let sessionId: string

beforeEach(() => {
  db = initDb(':memory:')
  clearHandlers()
  registerHandler('grade_session', handleGradeSession as never)
  registerHandler('extract_next_actions', handleExtractNextActions as never)
  registerHandler('refresh_prep', handleRefreshPrep as never)
  registerHandler('embed', async () => {})  // no-op for this test

  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'Build feature' })
  db.prepare(`UPDATE tasks SET idea_file = ? WHERE id = ?`).run('lib/feature.ts', taskId)
  sessionId = randomUUID()
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, status, created_at, ended_at, summary)
              VALUES (?, ?, ?, ?, ?, ?, 'ended', ?, ?, ?)`)
    .run(sessionId, projectId, 'L', 'spec', null, taskId, new Date().toISOString(), new Date().toISOString(), 'shipped feature')
  db.prepare(`INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('d1', sessionId, taskId, 'pick', 'spec', 'normal', '{}', new Date().toISOString())
  vi.mocked(localComplete).mockReset()
  vi.mocked(prepareTask as never).mockReset()
})

describe('end-to-end: session-end → grade + next_actions + refresh_prep', () => {
  it('drains in two scheduler ticks and matches tasks via files_touched', async () => {
    enqueueJob(db, 'grade_session', { session_id: sessionId }, { dedupKey: `grade_session:${sessionId}` })
    enqueueJob(db, 'extract_next_actions', { session_id: sessionId }, { dedupKey: `extract_next_actions:${sessionId}` })

    // Tick 1: grader returns 'yes', extractor returns files_touched matching the task
    vi.mocked(localComplete)
      .mockResolvedValueOnce('{ "grade": "yes", "reason": "shipped" }')
      .mockResolvedValueOnce(JSON.stringify({
        next_actions: ['document'],
        open_questions: [],
        files_touched: [{ path: 'lib/feature.ts', change: 'added' }],
      }))
    const r1 = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    expect(r1.ran).toBe(2)

    // Verify session row
    const sess = db.prepare(`SELECT grade, next_actions FROM sessions WHERE id = ?`).get(sessionId) as any
    expect(sess.grade).toBe('yes')
    expect(JSON.parse(sess.next_actions).files_touched).toHaveLength(1)

    // Verify routing_outcomes row
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = 'd1'`).get() as any
    expect(outcome.outcome).toBe('success')

    // Verify refresh_prep was enqueued for the task
    const refresh = db.prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'refresh_prep'`).get() as any
    expect(refresh.dedup_key).toBe(`refresh_prep:${taskId}`)

    // Tick 2: drain refresh_prep
    const r2 = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    expect(r2.ran).toBeGreaterThanOrEqual(1)
    expect(prepareTask).toHaveBeenCalledWith(db, taskId)
  })
})
```

- [ ] **Step 9: Run full suite + commit**

```
npx vitest run
git add lib/jobs/registerAll.ts lib/jobs/triggers app/api/projects/\[id\]/docs/route.ts lib/session-manager.ts lib/db/tasks.ts server.ts tests/sessions/grade-and-next-actions-pipeline.test.ts
git commit -m "feat(reflective): wire triggers + register handlers + scheduler in server.ts"
```

---

## Task 8: UI surfaces

This task lands five UI surfaces. Each is a sub-step with its own commit. Tests follow the patterns established in prior slices (mocks at top, `wrap()` helper with QueryClient, role/text queries).

**Pre-flight scout** before starting any sub-step:
```
grep -rln "router.*insights\|insights.*page\|useRouterDecision" app/\(dashboard\)/ 2>/dev/null
grep -rln "useTasks(" app/\(dashboard\)/projects/\[projectId\]/tasks 2>/dev/null
```
Pin the actual file paths for the insights page and the tasks-list page before editing.

### Sub-step 8a: Drawer Next-actions section

**File:** `components/sessions/SessionDetailDrawer.tsx` — add a collapsible Next section after the existing terminal/banner block. Render only when `session.next_actions` is non-null.

```tsx
// Inside SessionDetailDrawer, after the existing body:
{session.next_actions && (() => {
  let parsed: { next_actions?: string[]; open_questions?: string[]; files_touched?: Array<{ path: string; change: string }>; extracted_at?: string; model?: string } | null = null
  try { parsed = JSON.parse(session.next_actions) } catch {}
  if (!parsed) return null
  return (
    <div className="mt-4 border-t border-border-default pt-3 px-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
        Next {parsed.extracted_at && <span className="text-text-faint normal-case font-normal">· extracted by {parsed.model ?? 'local'}</span>}
      </div>
      {parsed.next_actions && parsed.next_actions.length > 0 && (
        <ul className="text-xs text-text-primary mb-3 space-y-1">
          {parsed.next_actions.map((a, i) => <li key={i}>• {a}</li>)}
        </ul>
      )}
      {parsed.open_questions && parsed.open_questions.length > 0 && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary mb-1.5">Open questions</div>
          <ul className="text-xs text-text-primary mb-3 space-y-1">
            {parsed.open_questions.map((q, i) => <li key={i}>• {q}</li>)}
          </ul>
        </>
      )}
      {parsed.files_touched && parsed.files_touched.length > 0 && (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary mb-1.5">Files touched</div>
          <ul className="text-xs font-mono text-text-primary mb-2 space-y-0.5">
            {parsed.files_touched.map((f, i) => (
              <li key={i}><span className="text-accent-blue">{f.path}</span> <span className="text-text-muted">— {f.change}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
})()}
```

**Test addition** in `components/sessions/__tests__/SessionDetailDrawer.test.tsx`:

```ts
it('renders Next section when session.next_actions is set', () => {
  const sessionWithNext = {
    ...baseSession,
    next_actions: JSON.stringify({
      next_actions: ['add tests', 'document'],
      open_questions: ['CSRF?'],
      files_touched: [{ path: 'lib/auth.ts', change: 'fixed' }],
      extracted_at: '2026-05-02T10:00:00Z',
      model: 'local',
    }),
  }
  wrap(<SessionDetailDrawer session={sessionWithNext} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
  expect(screen.getByText(/add tests/)).toBeInTheDocument()
  expect(screen.getByText(/CSRF/)).toBeInTheDocument()
  expect(screen.getByText(/lib\/auth\.ts/)).toBeInTheDocument()
})
```

Commit: `git add components/sessions/SessionDetailDrawer.tsx components/sessions/__tests__/SessionDetailDrawer.test.tsx && git commit -m "feat(reflective): drawer Next-actions section"`

### Sub-step 8b: DocSessionsPanel "Similar past sessions"

**File:** `components/docs/DocSessionsPanel.tsx` — add a section below the existing per-doc sessions list.

Add a new server endpoint first: `app/api/projects/[id]/embeddings/similar/route.ts`.

```ts
// app/api/projects/[id]/embeddings/similar/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { localEmbed, getLocalEmbeddingModel } from '@/lib/router/localEmbed'
import { findSimilar } from '@/lib/embeddings/search'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const body = await req.json() as { kind: string; ref: string; resultKinds?: string[]; limit?: number }
  const db = getDb()
  const provider = getDefaultLocalProvider(db)
  if (!provider) return NextResponse.json([])

  // Look up the embedding for the source ref
  const row = db.prepare(`SELECT vector, dim, model FROM embeddings WHERE project_id = ? AND kind = ? AND ref = ?`)
    .get(projectId, body.kind, body.ref) as { vector: Buffer; dim: number; model: string } | undefined
  if (!row) return NextResponse.json([])

  const queryVector = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)
  const matches = findSimilar(db, {
    projectId, queryVector, queryDim: row.dim, queryModel: row.model,
    kinds: body.resultKinds, limit: body.limit ?? 5, excludeRef: body.ref,
  })
  return NextResponse.json(matches)
}
```

Update `components/docs/DocSessionsPanel.tsx` to fetch similar sessions:

```tsx
// At top:
import useSWR from 'swr'

// Inside the component, after the existing sessions list:
const { data: similar = [] } = useSWR<Array<{ kind: string; ref: string; score: number }>>(
  `/api/projects/${projectId}/embeddings/similar`,
  () => fetch(`/api/projects/${projectId}/embeddings/similar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'doc', ref: relativePath, resultKinds: ['session_summary'], limit: 5 }),
  }).then(r => r.json()),
)

// JSX added after the per-doc sessions list:
{similar.length > 0 && (
  <div className="mt-6 pt-4 border-t border-border-default">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">Related sessions from elsewhere</h4>
    <ul className="text-xs space-y-1">
      {similar.map(m => (
        <li key={m.ref}>
          <a className="text-accent-blue hover:underline" href={`/sessions?selected=${m.ref}`}>session {m.ref.slice(0, 8)}</a>
          <span className="text-text-muted ml-2">({(m.score * 100).toFixed(0)}% match)</span>
        </li>
      ))}
    </ul>
  </div>
)}
```

**Test addition:** mock the SWR fetch to return a fixed array; assert the section renders with the ref and percentage.

Commit: `git add app/api/projects/\[id\]/embeddings components/docs/DocSessionsPanel.tsx components/docs/__tests__/DocSessionsPanel.test.tsx && git commit -m "feat(reflective): docs panel - related sessions via embedding search"`

### Sub-step 8c: Critic findings inline on docs page

**File:** `app/(dashboard)/projects/[projectId]/docs/page.tsx` — when viewing a `spec/*.md` or `plan/*.md`, render the latest `critic_findings` row above the markdown body.

Add a new endpoint: `app/api/projects/[id]/critic-findings/route.ts`.

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { createHash } from 'crypto'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return NextResponse.json({ error: 'ref required' }, { status: 400 })
  const db = getDb()
  const row = db.prepare(`SELECT findings, content_hash FROM critic_findings WHERE project_id = ? AND ref = ?`)
    .get(projectId, ref) as { findings: string; content_hash: string } | undefined
  if (!row) return NextResponse.json(null)
  return NextResponse.json({ findings: JSON.parse(row.findings), content_hash: row.content_hash })
}
```

Add a new component `components/docs/CriticFindingsPanel.tsx`:

```tsx
'use client'
import useSWR from 'swr'

type Issue = { severity: 'critical' | 'important' | 'minor'; category: string; message: string; line_hint?: number | null }
type Findings = { findings: { issues: Issue[]; votes: 1 | 2 | 3; model: string; run_at: string }; content_hash: string }

export function CriticFindingsPanel({ projectId, ref: docRef, currentHash }: { projectId: string; ref: string; currentHash: string }) {
  const { data } = useSWR<Findings | null>(
    `/api/projects/${projectId}/critic-findings?ref=${encodeURIComponent(docRef)}`,
    (url) => fetch(url).then(r => r.json()),
  )
  if (!data || !data.findings) return null
  const stale = data.content_hash !== currentHash
  const counts = data.findings.issues.reduce((acc, i) => { acc[i.severity] = (acc[i.severity] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="mb-6 p-3 bg-bg-secondary border border-border-default rounded">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-semibold">⚠️</span>
        <span><span className="text-accent-red">{counts.critical ?? 0} critical</span></span>
        <span><span className="text-accent-orange">{counts.important ?? 0} important</span></span>
        <span><span className="text-text-muted">{counts.minor ?? 0} minor</span></span>
        {stale && <span className="ml-auto text-text-faint italic text-[10px]">Stale — re-running</span>}
      </div>
      <ul className="mt-2 text-xs space-y-1">
        {data.findings.issues.map((issue, i) => (
          <li key={i} className={
            issue.severity === 'critical' ? 'text-accent-red' :
            issue.severity === 'important' ? 'text-accent-orange' : 'text-text-muted'
          }>
            <span className="font-mono text-[10px] uppercase">{issue.severity}</span>{' '}
            <span className="font-semibold">{issue.category}:</span> {issue.message}
            {issue.line_hint && <span className="text-text-faint"> (line {issue.line_hint})</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

In the docs page, mount this above the rendered markdown body when the selected file is under `docs/superpowers/specs/` or `docs/superpowers/plans/`:

```tsx
import { CriticFindingsPanel } from '@/components/docs/CriticFindingsPanel'
import { createHash } from 'crypto'  // server only — for client, use a small helper

// Where the markdown body renders:
{selected?.type === 'file' && (selected.relativePath.startsWith('docs/superpowers/specs/') || selected.relativePath.startsWith('docs/superpowers/plans/')) && (
  <CriticFindingsPanel
    projectId={projectId}
    ref={selected.relativePath}
    currentHash={selected.content ? sha256Hex(selected.content) : ''}
  />
)}
```

`sha256Hex` is a client-side helper — use the Web Crypto API:

```ts
// lib/util/sha256.ts
export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}
```

The hash is async; the panel accepts the hash via prop, so the docs page computes it once on selection change inside a `useEffect` and passes it down as a string state.

Commit: `git add app/api/projects/\[id\]/critic-findings components/docs/CriticFindingsPanel.tsx app/\(dashboard\)/projects/\[projectId\]/docs/page.tsx lib/util/sha256.ts && git commit -m "feat(reflective): critic findings inline on docs page"`

### Sub-step 8d: Router insights — graded outcomes column

**Pre-flight:** find the existing insights page. Likely `app/(dashboard)/insights/page.tsx` or `app/(dashboard)/projects/[projectId]/insights/page.tsx`. Also check for a router-decisions table component.

Update the existing per-provider stats query to LEFT JOIN `sessions.grade`:

```sql
SELECT
  rd.picked_provider AS provider,
  COUNT(*) FILTER (WHERE s.grade IS NOT NULL) AS graded,
  COUNT(*) FILTER (WHERE s.grade = 'yes') AS success,
  COUNT(*) FILTER (WHERE s.grade = 'partial') AS partial,
  COUNT(*) FILTER (WHERE s.grade = 'no') AS fail
FROM routing_decisions rd
LEFT JOIN sessions s ON s.id = rd.session_id
GROUP BY rd.picked_provider
```

Render as a new column block on the insights page. Compute success% as `(success + 0.5 * partial) / graded * 100` to match the router's score-based math.

Test by mocking the new API or query handler and asserting the rendered cells.

Commit: `feat(reflective): insights page - graded outcomes per provider`

### Sub-step 8e: Tasks-page dedup hint

**Pre-flight:** find the tasks-list rendering. Likely `app/(dashboard)/projects/[projectId]/tasks/page.tsx` or `components/tasks/TasksList.tsx`.

Add a small badge below each task title when the task's embedding has cosine ≥ 0.85 against another open task:

```tsx
import useSWR from 'swr'
function DedupHint({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { data } = useSWR<Array<{ ref: string; score: number }>>(
    `/api/projects/${projectId}/embeddings/similar`,
    () => fetch(`/api/projects/${projectId}/embeddings/similar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'task', ref: taskId, resultKinds: ['task'], limit: 1 }),
    }).then(r => r.json()),
  )
  const top = data?.[0]
  if (!top || top.score < 0.85) return null
  return (
    <a href={`/projects/${projectId}/tasks?selected=${top.ref}`} className="text-[10px] text-text-muted ml-2 hover:text-accent-blue">
      ↪ similar to: {top.ref.slice(0, 8)}
    </a>
  )
}
```

Embed below the task title in the existing list rendering.

Test: mock the similar endpoint to return a high-score match; assert the hint renders.

Commit: `feat(reflective): tasks page - dedup hint via embedding similarity`

### Sub-step 8f: Run full suite + smoke

```
npx vitest run
```

All UI tests should pass. If a fetch mock collides with another test's mock, scope each `vi.mock` to `beforeEach`/`afterEach` with `vi.unstubAllGlobals()`.

---

## Task 9: Smoke + ship

**Files:**
- Create: `docs/superpowers/specs/2026-05-02-reflective-workflow-smoke.md`

- [ ] **Step 1: Full suite green**
- [ ] **Step 2: Production build clean**
- [ ] **Step 3: Write smoke checklist (10 steps from spec verbatim)**
- [ ] **Step 4: Commit smoke doc**
- [ ] **Step 5: Final report**

```
git add docs/superpowers/specs/2026-05-02-reflective-workflow-smoke.md
git commit -m "docs(reflective): manual smoke checklist for reflective-workflow slice"
```

---

## Self-Review (controller after all tasks)

- All 9 tasks committed.
- Vitest green (current 993 baseline + ~50 new = ~1043).
- Production build clean.
- Migrations 65-69 + sentinel 999001 applied on dev DB.
- Scheduler logs "scheduler started" once on dev server boot.
- Provider config in dev points at llama.cpp (or compatible) with embedding model loaded.
- Touch a spec file → critic findings appear within ~2 minutes.
- Run a session against a task → grade + next_actions populated within ~30s.
- Embedding row count grows as docs page is visited.

## Out-of-Scope Reminders

- No HNSW. Brute-force search until proven slow.
- No /api/jobs/health. SQL inspection only.
- No worker-process extraction. In-process scheduler.
- No Ollama-specific paths. Same OpenAI-compatible HTTP for both servers.
- No backfill of historical sessions for grade/next_actions.
- No agent-name lookup for agent-kind originator (separate ship).
- Don't extract `<SessionSummaryCard>` shared component — duplication accepted per prior slice's risk acceptance.
