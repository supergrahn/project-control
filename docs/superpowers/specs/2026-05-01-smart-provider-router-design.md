# Smart Provider Router Design

Replace the static "first-active provider" fallback in `lib/sessions/resolveProvider.ts` with a router that picks the best `provider_id` for an upcoming session by combining task-class suitability, cost, and observed success rate. Always-on. Explicit pins (task → agent → project) still win. Useful on day one with shipped defaults; gets sharper as it accumulates outcomes.

This is **Slice A** of a five-slice automation roadmap (router → two-LLM phase gate → background routines → local-model utility layer → cost & observability). Each slice ships independently.

## Goals

- Eliminate the manual "which provider should this session use" decision for unpinned work.
- Get more value out of having Claude / Codex / Gemini / Ollama all configured: route trivial classifications to local, hard architectural work to top-tier models.
- Improve over time without manual tuning: the router learns which routes actually produce phase-advancing work in this user's repos.
- Stay out of the way: explicit pins still win, and the user can always pick a different route at session-start when the chosen one fails.

## Non-goals (v1)

- Real token-cost instrumentation. v1 uses static cost weights per provider type. Wiring real cost is a follow-up.
- A settings UI for editing the suitability matrix. The defaults file is the source of truth ("automation must just work").
- Two-LLM phase gates. That's slice B.
- Per-project routing-mode toggles. The router is universally on; pins are the escape hatch.
- Routing across local models within a single Ollama provider row. v1 treats each `Provider` row as one route; a future slice can add intra-local routing if multiple Ollama models are configured as separate provider rows.
- Automatic failover / retry on different providers. Failures surface to the user via a route-picker dialog (explicit, never silent).

## Background

`lib/db/providers.ts` already models a provider as a row with `id`, `name`, `type` (`claude` | `codex` | `gemini` | `ollama`), `command`, and `config`. The model name lives inside `command`/`config`, so each `Provider` row is already effectively a `(provider, model)` route. No new provider/model schema is required.

`lib/sessions/resolveProvider.ts` today walks a four-step cascade: task pin → agent pin → project pin → first active. Pinned providers always win. The router replaces only step four.

`server/orchestrator-watcher.ts` already emits `OrchestratorDecision` rows with `severity ∈ 'info' | 'warn' | 'override'`. Phase advancement events are the natural success signal; `severity: 'override'` is the natural failure signal.

`lib/sessions/adapters/ollama.ts` is the existing Ollama adapter — but it is a streaming-CLI wrapper for full sessions, not a one-shot completion API. The complexity classifier therefore does **not** use this adapter directly. It uses a new lightweight helper (`localComplete`) that hits the local model's OpenAI-compatible chat-completions endpoint (works with both Ollama's OpenAI shim on `:11434/v1` and llama.cpp's `llama-server` on `:8080/v1`). Endpoint is configurable per provider via `Provider.config`. See the **Complexity classifier** section for details.

The `tasks` table has `status` (not `phase`). Phase is a session concept (`sessions.phase`, declared `NOT NULL`). The router takes phase from the `SpawnOptions.phase` of the session being created.

## Architecture

### New module `lib/router/`

```
lib/router/
  index.ts         — re-exports
  pickRoute.ts     — pickRoute(db, opts) → RoutingDecision
  recordOutcome.ts — recordOutcome(db, { decisionId, outcome })
  classify.ts      — classifyComplexity(db, taskId) → Complexity
  scoring.ts       — pure scoring math (testable in isolation)
  defaults.ts      — suitability matrix + cost weights, hand-keyed
  prompts.ts       — COMPLEXITY_PROMPT template
  localComplete.ts — one-shot HTTP completion call to a local model
  types.ts         — shared types
```

Public surface:
- `pickRoute()` — called from `resolveProvider`'s "first active" fallback branch.
- `recordOutcome()` — called from `orchestrator-watcher` when phase-advancement or override decisions land.
- `classifyComplexity()` — called lazily from `pickRoute()` when a task lacks a complexity tag. (Not from `createTask` — keeps task creation synchronous and the classifier on a single code path.)

### Cascade integration

`lib/sessions/resolveProvider.ts` is unchanged through steps 1-3 (task pin, agent pin, project pin). Two additions:

1. `ResolveProviderOpts` gains a required `phase: SessionPhase` field. Both existing call sites in `lib/session-manager.ts` (lines 148 and 558) are updated to pass it; `spawnOrchestratorSession` passes `'orchestrator'`.
2. Step 4 changes from `getActiveProviders(db)[0]` to:

```ts
const decision = await pickRoute(db, {
  projectId: opts.projectId,
  taskId: opts.taskId,           // may be undefined (e.g. orchestrator sessions)
  phase: opts.phase,
})
return getProvider(db, decision.providerId)!
```

`resolveProvider` becomes async (`Promise<Provider>`), since `pickRoute` may need to call the local classifier. Both call sites are updated to `await`.

When a pin wins (steps 1-3), the router is **not** called and no `routing_decisions` row is written. Pin behavior is preserved exactly.

### Feedback loop

`server/orchestrator-watcher.ts` already observes phase transitions and override events. The router hook fires on **only two** specific points in the watcher (not on every `OrchestratorDecision` write — `info` and `warn` decisions are heartbeats and would over-count):

1. When the watcher detects a phase advance for a session — it looks up the latest `routing_decisions` row for the session (`ORDER BY created_at DESC LIMIT 1`) and calls `recordOutcome(db, { decisionId, outcome: 'success' })`. Fires once per session per phase advancement.
2. When the watcher writes an `OrchestratorDecision` with `severity === 'override'` for a session — it looks up the latest `routing_decisions` row and calls `recordOutcome(db, { decisionId, outcome: 'failure' })`. Fires once per override.

A third call site:

3. The `POST /api/sessions/:id/restart-with-route` handler calls `recordOutcome(db, { decisionId, outcome: 'transient_error' })` on the failed decision before writing the new one.

`severity === 'info'` and `severity === 'warn'` decisions never trigger recordOutcome. They are not outcome signals.

`transient_error` rows are stored for analytics but **excluded from the success-rate denominator** when scoring. Adapter spawn failures are not quality signals.

`recordOutcome()` writes one `routing_outcomes` row and incrementally updates the `routing_scores` row for the corresponding `(phase, complexity, provider_id)` cell. No nightly batch job.

### Failure flow

Adapter spawn happens inside `lib/session-manager.ts`, after `resolveProvider` returns. If the adapter throws (rate-limit, API error, command-not-found, garbage output), the session is created in a new status `needs_route_retry` instead of `active`. The UI subscribes to session events and opens `RouteRetryDialog` showing:

- The adapter error message.
- The top-N (default 5) alternative routes ranked by `pickRoute()`, with the failed route excluded.
- A "Cancel" button that leaves the session in `needs_route_retry` (user can retry later via the session card).

User picks → server endpoint `POST /api/sessions/:id/restart-with-route` records a `transient_error` outcome on the failed decision, writes a fresh `routing_decisions` row for the new route, and respawns the session. The session status moves back to `active` (or back to `needs_route_retry` if the new route also fails).

## Data model

Three new SQLite tables, added via the existing `runMigration(db, n, name, sql, true)` pattern. Each `runMigration` call takes a single SQL statement, so indexes and tables are separate migrations. Migration numbers continue from the current head (50): use **51 through 57**.

```sql
-- Migration 51 — create routing_decisions
CREATE TABLE IF NOT EXISTS routing_decisions (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  picked_provider TEXT NOT NULL REFERENCES providers(id),
  phase           TEXT NOT NULL,
  complexity      TEXT NOT NULL,         -- 'trivial' | 'normal' | 'hard'; defaults to 'normal' on insert when no task
  score_breakdown TEXT NOT NULL,         -- JSON.stringify of breakdown shape
  created_at      TEXT NOT NULL
);

-- Migration 52 — index on routing_decisions
CREATE INDEX IF NOT EXISTS idx_routing_decisions_session ON routing_decisions(session_id);

-- Migration 53 — create routing_outcomes
CREATE TABLE IF NOT EXISTS routing_outcomes (
  id           TEXT PRIMARY KEY,
  decision_id  TEXT NOT NULL REFERENCES routing_decisions(id) ON DELETE CASCADE,
  outcome      TEXT NOT NULL CHECK (outcome IN ('success','failure','transient_error')),
  created_at   TEXT NOT NULL
);

-- Migration 54 — index on routing_outcomes
CREATE INDEX IF NOT EXISTS idx_routing_outcomes_decision ON routing_outcomes(decision_id);

-- Migration 55 — create routing_scores
CREATE TABLE IF NOT EXISTS routing_scores (
  phase        TEXT NOT NULL,
  complexity   TEXT NOT NULL,
  provider_id  TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  n_outcomes   INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (phase, complexity, provider_id)
);

-- Migration 56 — tasks.complexity column
ALTER TABLE tasks ADD COLUMN complexity TEXT;          -- 'trivial' | 'normal' | 'hard' | NULL

-- Migration 57 — tasks.complexity_overridden column
ALTER TABLE tasks ADD COLUMN complexity_overridden INTEGER NOT NULL DEFAULT 0;
```

`complexity` on `tasks` is `NULL` until the classifier runs lazily on first `pickRoute`. `complexity_overridden = 1` means the user manually set the value; the classifier will not re-run regardless of subsequent edits.

### Sessions table — new status value

`sessions.status` today is informally `'active' | 'ended'`. We add `'needs_route_retry'`. No schema change is needed (the column is an unconstrained TEXT), but the new value must be added to the `SessionStatus` TypeScript union in `lib/db.ts` and any UI status filters updated.

### `score_breakdown` JSON shape

Stored as `JSON.stringify(...)` in the TEXT column. Top-level fields are for the **chosen** route; `considered` is the ranked list of all candidates so the UI can show alternatives without recomputing.

```json
{
  "suitability": 0.8,
  "cost": 0.05,
  "success_rate_blended": 0.79,
  "n_observed": 4,
  "total": 10.04,
  "considered": [
    { "providerId": "p1", "providerName": "Claude Opus", "score": 10.04 },
    { "providerId": "p2", "providerName": "Codex 5.3",   "score": 8.61 }
  ]
}
```

(Numbers are illustrative. `default_rate` equals `suitability` by definition and is not stored separately.)

`considered[0]` always equals the chosen route (`considered` is sorted descending by `score`, ties broken by `providerId` for determinism).

## Defaults file

`lib/router/defaults.ts`:

```ts
import type { SessionPhase } from '@/lib/db'                  // existing union: 'ideate' | 'brainstorm' | ...
import type { ProviderType } from '@/lib/db/providers'        // existing union: 'claude' | 'codex' | 'gemini' | 'ollama'

export type Complexity = 'trivial' | 'normal' | 'hard'
// Re-exported via lib/router/types.ts so the rest of the module avoids reaching into db modules for types.

// 0..1 — how well this provider type suits this (phase, complexity) cell.
export const SUITABILITY: Record<SessionPhase, Record<Complexity, Record<ProviderType, number>>> = {
  /* 6 × 3 × 4 = 72 cell values, hand-authored during implementation */
}

// 0..1 — relative cost. local≈0.01, gemini-flash≈0.05, sonnet/codex-mini≈0.3, opus/codex≈1.0.
export const COST_BY_PROVIDER_TYPE: Record<ProviderType, number> = {
  ollama: 0.01,
  gemini: 0.05,
  codex: 0.6,
  claude: 0.5,
}

export const N_PRIOR = 10  // Bayesian prior weight; defaults dominate until n_observed crosses this
export const COST_EPSILON = 0.01  // divide-by-zero guard in scoring
```

The 72 suitability cell values are authored during implementation based on the user's stated provider strengths (Claude → planning/architecture, Codex → aggressive refactors, Gemini → long context, local → triage / classification). Shipped as-is — no review gate, no settings UI. The adaptive layer takes over once data accumulates per cell.

Per-provider cost can be refined via an optional top-level `cost_weight: number` field in `Provider.config` (which is JSON-serialized). When absent, falls back to `COST_BY_PROVIDER_TYPE[provider.type]`. Other adapter-specific fields in `config` are unaffected.

## Scoring function

Pure function in `lib/router/scoring.ts`:

```ts
function score(provider, phase, complexity, observed):
    suit  = SUITABILITY[phase][complexity][provider.type]
    cost  = provider.config?.cost_weight ?? COST_BY_PROVIDER_TYPE[provider.type]
    deflt = suit  // default success-rate prior = suitability
    rate  = (observed.n × observed.rate + N_PRIOR × deflt) / (observed.n + N_PRIOR)
    return suit × rate / max(cost, COST_EPSILON)
```

Cold-start (`n_observed = 0`) → `rate = deflt = suit` → `score = suit² / cost`. Pure-default ranking; equivalent to "trust the matrix."

After many observations (`n_observed ≫ N_PRIOR`) → `rate → observed.rate` → adaptive ranking dominates.

`pickRoute()` enumerates **active** providers, joins each with its `routing_scores` row for the relevant `(phase, complexity, provider_id)` cell (zero-row treated as `n=0, rate=0`), computes `score()` for each, sorts descending, picks the top, returns the full ranked list as `considered` for the breakdown. If no active providers exist, throws `NO_PROVIDERS_CONFIGURED` (mirroring the existing `resolveProvider` error so the caller's error handling is unchanged).

If `provider.type` is not present in the SUITABILITY matrix (e.g. a future provider type added before the matrix is updated), the missing cell is treated as `0.5` rather than producing `NaN`. This guarantees the new provider is at least considered, and a log-warn is emitted so it gets added to the matrix.

## Complexity classifier

`lib/router/classify.ts`:

```ts
export async function classifyComplexity(db: Database, taskId: string | undefined): Promise<Complexity> {
  if (!taskId) return 'normal'                    // taskless sessions (e.g. orchestrator)
  const task = getTask(db, taskId)
  if (!task) return 'normal'
  if (task.complexity) return task.complexity     // cached (whether overridden or auto-tagged)

  const ollama = getDefaultLocalProvider(db)      // new helper: first active type='ollama', else null
  if (!ollama) {
    setTaskComplexity(db, taskId, 'normal', /* overridden */ false)
    return 'normal'                               // graceful fallback when no local provider configured
  }

  const prompt = COMPLEXITY_PROMPT
    .replace('{title}', task.title)
    .replace('{description}', task.notes ?? '')   // tasks store long text in `notes`, not `description`

  let tag: Complexity = 'normal'
  try {
    const response = await localComplete(ollama, prompt, { maxTokens: 10, timeoutMs: 5000 })
    tag = parseTag(response)                      // strict: 'trivial' | 'normal' | 'hard'; fallback 'normal'
  } catch {
    tag = 'normal'                                // local model unreachable → safe default; do not block routing
  }

  setTaskComplexity(db, taskId, tag, /* overridden */ false)
  return tag
}
```

New helpers added in this slice:
- `getDefaultLocalProvider(db)` in `lib/db/providers.ts` — returns first `is_active = 1` provider with `type === 'ollama'`, else `null`.
- `setTaskComplexity(db, id, complexity, overridden)` in `lib/db/tasks.ts` — sets both columns atomically.
- `localComplete(provider, prompt, opts)` in `lib/router/localComplete.ts` — see below.

### `lib/router/localComplete.ts`

A one-shot HTTP helper for the local model. Uses **OpenAI-compatible chat completions** (`POST {baseUrl}/v1/chat/completions`) — supported by both Ollama (its OpenAI-compat shim, on port 11434) and llama.cpp (`llama-server`, default port 8080). Body shape:

```json
{
  "model": "<model name>",
  "messages": [{ "role": "user", "content": "<prompt>" }],
  "max_tokens": 10,
  "stream": false,
  "temperature": 0
}
```

Reads `baseUrl` and `model` from `Provider.config` (parsed JSON: `{ baseUrl?: string, model?: string }`). Defaults: `baseUrl = 'http://localhost:11434/v1'`, `model = 'llama3'`. The user can override per provider — for llama.cpp set `baseUrl: 'http://localhost:8080/v1'` and the appropriate model name.

Returns `response.choices[0].message.content` as a string. Wraps the call in an `AbortController` with the `timeoutMs` option. Throws on non-2xx, malformed response, or timeout.

This is the only new external-network dependency in the slice; covered by tests with a mocked fetch.

### `COMPLEXITY_PROMPT`

`lib/router/prompts.ts`:

```
You are a task complexity classifier. Read the task title and description and reply with EXACTLY ONE of these tokens, lowercase, no other text:

trivial — small, mechanical, low-judgment work (rename, format, copy edit, single-file tweak)
normal — typical multi-step feature/bugfix that touches a handful of files
hard — multi-system change, deep refactor, ambiguous requirements, design or research-heavy

Title: {title}
Description: {description}

Reply:
```

### When the classifier runs

Lazy. Triggered only inside `pickRoute()` when the task row's `complexity` is `NULL`. Result is cached on the task row. User can change it via the task UI (sets `complexity_overridden = 1`); subsequent reads see the cached value and skip the classifier.

## Visibility

- Session card in the dashboard gains a small "via router" badge when the session was started by router decision (i.e. a `routing_decisions` row exists for the session). Hover popover shows `score_breakdown.considered` as a small ranked list with the chosen route highlighted.
- New API route `GET /api/router/decisions?sessionId=...` returns the latest `routing_decisions` row for inspection.
- A debug page `/debug/router` (gated by `process.env.ENABLE_DEBUG_PAGES === '1'`; no auth model exists in this app today) shows the current `routing_scores` table for the active project. Useful while the matrix is settling.
- "Reset router learning" admin action: deletes all rows from `routing_outcomes` and `routing_scores`. Defaults take over again. Implemented as a button on `/debug/router`.

## Failure dialog

`components/router/RouteRetryDialog.tsx`:

- Triggered when a session enters status `needs_route_retry`. The session detail page subscribes to session-status changes and opens the modal automatically; it is also accessible via a button on the session card.
- Shows: error message from the adapter, "the router picked X — it failed because Y", a list of the next 5 candidates with score / provider name, and a Cancel button.
- On select, calls `POST /api/sessions/:id/restart-with-route` with body `{ providerId }`. The server records a `transient_error` outcome on the failed decision, writes a fresh `routing_decisions` row for the new pick, sets the session status to `active`, and respawns. If the new spawn also fails, the session re-enters `needs_route_retry` and the dialog reopens with the next route as the suggested pick.

## Testing strategy

- `scoring.ts` is a pure function; covered by table-driven tests asserting:
  - cold-start (`n=0`) ranking equals `suit² / cost` ranking.
  - blending at `n=5`, `n=10`, `n=50` matches the formula to a small epsilon.
  - cost epsilon prevents divide-by-zero when `cost_weight === 0`.
- `pickRoute.ts` integration tests against a fixture DB with a small `providers` set and pre-seeded `routing_scores`; covers the no-task case (complexity defaults to `'normal'`) and the no-providers case (throws `NO_PROVIDERS_CONFIGURED`).
- `classify.ts` unit tests with a mocked `localComplete`: parse valid tags, parse invalid output (falls back to `'normal'`), the `complexity` cache short-circuit, the `complexity_overridden` short-circuit, the no-local-provider short-circuit, the timeout/error short-circuit.
- `localComplete.ts` tests with a mocked fetch: success path, timeout via AbortController, non-JSON response.
- `recordOutcome.ts` integration test: writes outcome, asserts `routing_scores` row updates with the right `n_outcomes` and `success_rate`; transient_error increments no counters.
- `resolveProvider.ts` regression tests: pinned task / agent / project still win; the router branch is exercised only when nothing is pinned; new async signature works for both call sites.
- End-to-end smoke: orchestrator-watcher emits a phase-advance decision → `recordOutcome` is invoked → `routing_outcomes` row appears → `routing_scores` row updates → next `pickRoute()` for the same cell reflects the new rate.
- `RouteRetryDialog` UI test: renders ranked alternatives, calls the right endpoint on select, handles a second failure.

## Open questions deferred to plan / implementation

- Whether `recordOutcome` should also fire for non-orchestrator session endings (e.g. user-killed, hung-killed). v1 only listens to orchestrator-watcher events; can be expanded in a later slice.
- Whether the badge belongs on every session card or only the most-recent N. UX call, can be tuned in implementation.
- Whether to seed `routing_scores` lazily on first `recordOutcome` for a cell vs. eagerly for all `(phase, complexity, provider) ∈ active providers` at provider-add time. Lazy is simpler and chosen by default; revisit if the dashboard needs to show empty cells.

## Migration / implementation plan

(Order matters; each step is independently mergeable except where noted.)

1. **Schema**: add migrations 51-57 to `lib/db.ts` (three new tables, two new indexes, two new task columns — seven `runMigration` calls). Update the `Task` TypeScript type in `lib/db/tasks.ts` (or wherever it's declared) to include `complexity: Complexity | null` and `complexity_overridden: number`. Update the `SessionStatus` TypeScript union in `lib/db.ts` to include `'needs_route_retry'`.
2. **DB helpers**: `getDefaultLocalProvider()` in `lib/db/providers.ts`; `setTaskComplexity()` in `lib/db/tasks.ts`.
3. **Module skeleton**: create `lib/router/` with empty exports for `pickRoute`, `recordOutcome`, `classifyComplexity`, `score`, `localComplete`, plus `defaults.ts`, `prompts.ts`, `types.ts`. Compiles cleanly, no behavior change.
4. **Author the SUITABILITY matrix** in `defaults.ts` (72 cells). Shipped as-is; no review gate.
5. **Implement `score()`** with full unit tests.
6. **Implement `localComplete()`** with full unit tests (mocked fetch).
7. **Implement `classifyComplexity()`** with full unit tests (mocked localComplete).
8. **Implement `pickRoute()`** with integration tests against a fixture DB.
9. **Implement `recordOutcome()`** with integration tests.
10. **Plumb `phase` through `ResolveProviderOpts`**; update both call sites in `lib/session-manager.ts`. Make `resolveProvider` async; `await` at call sites. (This step changes a public function signature — coordinate with any in-flight work.)
11. **Replace step 4 of `resolveProvider`** with the `pickRoute()` call. Existing pinned projects unaffected.
12. **Wire orchestrator-watcher hook**: after writing an `OrchestratorDecision`, call `recordOutcome` for the relevant session.
13. **Add API routes**: `POST /api/sessions/:id/restart-with-route` (records `transient_error`, writes new decision, respawns) and `GET /api/router/decisions?sessionId=...` (returns the latest decision row with `score_breakdown` parsed). Add the `RouteRetryDialog` component.
14. **Update `session-manager.ts` spawn** to set `needs_route_retry` status on adapter throw instead of throwing through.
15. **Add session card badge + hover popover**, debug page, reset button.
16. **End-to-end smoke** in dev and ship.

Backfill: none required. Existing tasks get `complexity = NULL`; the classifier runs lazily next time `pickRoute` needs it. Existing pinned sessions never invoke the router.

## Out-of-scope follow-ups (queued for later slices)

- **Two-LLM phase gate (slice B)**: review by a different provider before phase advancement.
- **Background routines (slice C)**: cron-style scheduled agents per project.
- **Local-model utility layer (slice D)**: full local-model usage beyond the classifier (auto-tagging, anomaly watcher, embeddings, etc.).
- **Cost & observability (slice E)**: real token instrumentation, budgets, dashboard.
