# Smart Provider Router Design

Replace the static "first-active provider" fallback in `lib/sessions/resolveProvider.ts` with a router that picks the best `provider_id` for an upcoming session by combining task-class suitability, cost, and observed success rate. Always-on. Explicit pins (task → agent → project) still win. Useful on day one with shipped defaults; gets sharper as it accumulates outcomes.

This is **Slice A** of a five-slice automation roadmap (router → two-LLM phase gate → background routines → local-model utility layer → cost & observability). Each slice ships independently.

## Goals

- Eliminate the manual "which provider should this session use" decision for unpinned work.
- Get more value out of having Claude / Codex / Gemini / Ollama all configured: route trivial classifications to local, hard architectural work to top-tier models.
- Improve over time without manual tuning: the router learns which routes actually produce phase-advancing work in this user's repos.
- Stay out of the way: explicit pins still win, and the user can always pick a different route at session-start.

## Non-goals (v1)

- Real token-cost instrumentation. v1 uses static cost weights per provider type. Wiring real cost is a follow-up.
- A settings UI for editing the suitability matrix. The defaults file is the source of truth ("automation must just work").
- Two-LLM phase gates. That's slice B.
- Per-project routing-mode toggles. The router is universally on; pins are the escape hatch.
- Routing across local models within the local provider. v1 treats each `Provider` row as one route; a future slice can add intra-local routing if there are multiple Ollama models.

## Background

`lib/db/providers.ts` already models a provider as a row with `id`, `name`, `type` (`claude` | `codex` | `gemini` | `ollama`), `command`, and `config`. The model name lives inside `command`/`config`, so each `Provider` row is already effectively a `(provider, model)` route. No new provider/model schema is required.

`lib/sessions/resolveProvider.ts` today walks a four-step cascade: task pin → agent pin → project pin → first active. Pinned providers always win. The router replaces only step four.

`server/orchestrator-watcher.ts` already emits `OrchestratorDecision` rows with `severity ∈ 'info' | 'warn' | 'override'`. Phase advancement events are the natural success signal; `severity: 'override'` is the natural failure signal.

`lib/sessions/adapters/ollama.ts` is the existing local-model adapter. The complexity classifier reuses it.

## Architecture

### New module `lib/router/`

```
lib/router/
  index.ts          re-exports
  pickRoute.ts      pickRoute(db, opts) → { providerId, decisionId, scoreBreakdown }
  recordOutcome.ts  recordOutcome(db, { decisionId, outcome })
  classify.ts       classifyComplexity(db, taskId) → 'trivial' | 'normal' | 'hard'
  scoring.ts        pure scoring math (testable in isolation)
  defaults.ts       suitability matrix + cost weights, hand-keyed
  types.ts          shared types
```

Public surface used by other modules:
- `pickRoute()` — called from `resolveProvider`'s "first active" fallback branch.
- `recordOutcome()` — called from `orchestrator-watcher` when phase-advancement or override decisions land.
- `classifyComplexity()` — called from the task creation/update path to populate `tasks.complexity`.

### Cascade integration

`lib/sessions/resolveProvider.ts` is unchanged through steps 1-3 (task pin, agent pin, project pin). Step 4 changes from `getActiveProviders(db)[0]` to:

```ts
const decision = pickRoute(db, {
  projectId: opts.projectId,
  taskId: opts.taskId,
  phase: opts.phase,
})
return getProvider(db, decision.providerId)!
```

Pin behavior is preserved exactly. When a pin wins, the router is *not* called and no `routing_decisions` row is written. (Optional future analytics: write a `pin_overrode = 1` row anyway. Out of scope for v1 to keep the diff small.)

### Feedback loop

`orchestrator-watcher.ts` already observes phase transitions and override events. After it writes the `OrchestratorDecision`, it looks up the most recent `routing_decisions` row for `session_id` and calls:

```ts
recordOutcome(db, { decisionId, outcome })
// outcome:
//   'success'         when phase advances without an override decision
//   'failure'         when severity = 'override' lands on this session
//   'transient_error' when adapter throws a rate-limit / timeout
```

`transient_error` is recorded for analytics but **excluded from the success-rate denominator** — it is not a quality signal.

`recordOutcome()` writes a `routing_outcomes` row and incrementally updates the `routing_scores` row for the corresponding `(phase, complexity, provider_id)` cell. No nightly batch job.

### Failure flow

Adapter throws on session start. The session moves to a new state `needs_route_retry`. The UI opens `RouteRetryDialog` showing:
- The error message from the adapter.
- The top-N (default 5) alternative routes from `pickRoute()`, with the failed route excluded.
- A "Cancel" option that leaves the session in `needs_route_retry`.

User picks → a new `routing_decisions` row is written → session restarts with the new route. The original failed route gets a `transient_error` outcome.

## Data model

Three new SQLite tables, migrated through `lib/db.ts`:

```sql
CREATE TABLE routing_decisions (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  picked_provider TEXT NOT NULL REFERENCES providers(id),
  phase           TEXT NOT NULL,
  complexity      TEXT NOT NULL,
  score_breakdown TEXT NOT NULL, -- JSON
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_routing_decisions_session ON routing_decisions(session_id);

CREATE TABLE routing_outcomes (
  id           TEXT PRIMARY KEY,
  decision_id  TEXT NOT NULL REFERENCES routing_decisions(id) ON DELETE CASCADE,
  outcome      TEXT NOT NULL CHECK (outcome IN ('success','failure','transient_error')),
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_routing_outcomes_decision ON routing_outcomes(decision_id);

CREATE TABLE routing_scores (
  phase        TEXT NOT NULL,
  complexity   TEXT NOT NULL,
  provider_id  TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  n_outcomes   INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (phase, complexity, provider_id)
);
```

Plus two columns on `tasks`:

```sql
ALTER TABLE tasks ADD COLUMN complexity TEXT;          -- 'trivial' | 'normal' | 'hard' | NULL
ALTER TABLE tasks ADD COLUMN complexity_overridden INTEGER NOT NULL DEFAULT 0;
```

`complexity` is `NULL` until the classifier runs. `complexity_overridden = 1` means the user manually changed it; the classifier will not re-run on subsequent task edits in that case.

### `score_breakdown` JSON shape

```json
{
  "suitability": 0.8,
  "cost_norm": 0.05,
  "success_rate_blended": 0.72,
  "n_observed": 4,
  "default_rate": 0.7,
  "total": 11.5,
  "considered": [
    { "providerId": "p1", "score": 11.5 },
    { "providerId": "p2", "score": 9.2 }
  ]
}
```

This is what the session card's hover popover renders. It also makes route decisions auditable.

## Defaults file

`lib/router/defaults.ts`:

```ts
export type Phase = 'ideate' | 'brainstorm' | 'spec' | 'plan' | 'develop' | 'orchestrator'
export type Complexity = 'trivial' | 'normal' | 'hard'
export type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

// 0..1 — how well this provider type suits this (phase, complexity) cell.
export const SUITABILITY: Record<Phase, Record<Complexity, Record<ProviderType, number>>> = {
  ideate:       { trivial: {...}, normal: {...}, hard: {...} },
  brainstorm:   { ... },
  spec:         { ... },
  plan:         { ... },
  develop:      { ... },
  orchestrator: { ... },
}

// 0..1 — relative cost. local≈0.01, haiku-tier≈0.05, sonnet-tier≈0.3, opus-tier/gpt-5.3≈1.0.
export const COST_BY_PROVIDER_TYPE: Record<ProviderType, number> = {
  ollama: 0.01,
  gemini: 0.05,
  codex: 0.6,
  claude: 0.5,
}

export const N_PRIOR = 10
```

Per-provider cost can be refined via an optional `cost_weight` field in `Provider.config` (JSON); falls back to `COST_BY_PROVIDER_TYPE[provider.type]`.

The exact suitability cell values are filled in during implementation. They reflect the user's stated provider strengths (Claude → planning/architecture, Codex → aggressive refactors, Gemini → long context / vision, local → triage / classification). They are starting weights only; the adaptive layer takes over once data accumulates.

## Scoring function

Pure function in `lib/router/scoring.ts`:

```ts
function score(provider, phase, complexity, observed):
    suit  = SUITABILITY[phase][complexity][provider.type]
    cost  = provider.cost_weight ?? COST_BY_PROVIDER_TYPE[provider.type]
    deflt = suit  // default success-rate prior = suitability
    rate  = (observed.n × observed.rate + N_PRIOR × deflt) / (observed.n + N_PRIOR)
    return suit × rate / max(cost, 0.01)
```

Cold-start (`n_observed = 0`) → `rate = deflt = suitability` → `score = suit² / cost`. Pure-default ranking, equivalent to "trust the matrix."

After many observations (`n_observed >> N_PRIOR`) → `rate → observed.rate` → adaptive ranking dominates.

`pickRoute()` enumerates active providers, computes `score()` for each, picks the highest, returns the full ranked list as `considered` for the score breakdown.

## Complexity classifier

`lib/router/classify.ts`:

```ts
export async function classifyComplexity(db, taskId): Promise<Complexity> {
  const task = getTask(db, taskId)
  if (task.complexity_overridden && task.complexity) return task.complexity
  const ollama = getDefaultLocalProvider(db)  // new helper: first active provider with type='ollama', else null
  if (!ollama) {
    setTaskComplexity(db, taskId, 'normal', false)
    return 'normal'  // graceful fallback when no local provider is configured
  }
  const prompt = COMPLEXITY_PROMPT
    .replace('{title}', task.title)
    .replace('{description}', task.description ?? '')
    .replace('{phase}', task.phase ?? 'unknown')
  const response = await callOllama(ollama, prompt, { max_tokens: 10 })
  const tag = parseTag(response)  // strict: 'trivial' | 'normal' | 'hard' | fallback 'normal'
  setTaskComplexity(db, taskId, tag, false)
  return tag
}
```

`getDefaultLocalProvider(db)` is a new helper added alongside `getActiveProviders()`. It returns the first active provider of `type === 'ollama'`, or `null` if none exists.

The prompt is a short instruction that asks for one of three tokens, with one-line examples. Stored in `lib/router/prompts.ts`. The classifier runs:
- On task creation.
- On task edit, **only if** `title` or `description` changed and `complexity_overridden = 0`.

A user override sets `complexity_overridden = 1` and prevents future re-classification.

## Visibility

- Session card in the dashboard gains a small "via router" badge when the session was started by router decision (i.e. a `routing_decisions` row exists with no `pin_overrode`). Hover popover shows `score_breakdown.considered` as a small ranked list with the chosen route highlighted.
- New API route `GET /api/router/decisions?sessionId=...` returns the `routing_decisions` row for inspection.
- A debug page `/debug/router` (admin-only, behind a simple env flag) shows the current `routing_scores` table for the active project. Useful while the matrix is settling. Out of scope to design polish.
- "Reset router learning" admin action: deletes all rows from `routing_outcomes` and `routing_scores`. Defaults take over again. Implemented as a button on `/debug/router`.

## Failure dialog

`components/router/RouteRetryDialog.tsx`:

- Triggered when a session enters `needs_route_retry`.
- Shows: error message, "the router picked X — it failed because Y", a list of the next 5 candidates with their score/provider name, and a Cancel button.
- On select, calls `POST /api/sessions/:id/restart-with-route` with the chosen `provider_id`. The server records a `transient_error` outcome on the failed decision and writes a fresh `routing_decisions` row before restarting the session.

## Testing strategy

- `scoring.ts` is a pure function; covered by table-driven tests asserting:
  - cold-start (`n=0`) ranking equals suitability/cost ranking.
  - blending at `n=5`, `n=10`, `n=50` matches the formula.
  - cost epsilon prevents divide-by-zero.
- `pickRoute.ts` integration tests against a fixture DB with a small `providers` set and pre-seeded `routing_scores`.
- `classify.ts` unit tests with a mocked Ollama adapter; covers parsing of valid tags, parsing of invalid output (falls back to `'normal'`), and the `complexity_overridden` short-circuit.
- `recordOutcome.ts` integration test: writes outcome, asserts `routing_scores` row updates incrementally with the right `n_outcomes` and `success_rate`.
- `resolveProvider.ts` regression tests: pinned task / agent / project still win; the router branch is exercised only when nothing is pinned.
- End-to-end smoke: orchestrator-watcher emits a phase-advance decision → `routing_outcomes` row appears → `routing_scores` row updates → next `pickRoute()` for the same cell reflects the new rate.

## Open questions deferred to plan / implementation

- Exact cell values for the `SUITABILITY` matrix. To be drafted during implementation by the developer based on their experience, then adjusted from observed outcomes.
- Whether the "via router" badge belongs on every session card or only the next-N. Pure UX call, can be tuned in implementation.
- Whether `recordOutcome` should also fire for non-orchestrator session endings (e.g. user-killed sessions). v1 only listens to orchestrator-watcher events; can be expanded later.

## Migration plan

1. Add the three new tables and the two new columns. SQLite `ALTER TABLE` for the column adds; `CREATE TABLE IF NOT EXISTS` for the new tables. All run on `initDb()`.
2. Add `getDefaultLocalProvider()` helper to `lib/db/providers.ts`.
3. Author the initial `SUITABILITY` matrix values in `lib/router/defaults.ts`. Reviewed by the user before merge — these starter weights matter because the adaptive layer blends from them until each cell has 10+ outcomes.
4. Replace the `getActiveProviders()[0]` line in `resolveProvider` with the `pickRoute()` call.
5. Wire the orchestrator-watcher hook: after writing an `OrchestratorDecision` for a session, look up the latest `routing_decisions` row for that `session_id` and call `recordOutcome()` with the appropriate outcome.
6. Add the new API route `POST /api/sessions/:id/restart-with-route` and the `RouteRetryDialog` component.
7. Ship. Backfill: none required. Existing tasks get `complexity = NULL`; the classifier runs lazily on next route decision. Pinned projects are unaffected.

## Out-of-scope follow-ups (queued for later slices)

- **Two-LLM phase gate (slice B)**: review by a different provider before phase advancement.
- **Background routines (slice C)**: cron-style scheduled agents per project.
- **Local-model utility layer (slice D)**: full local model usage beyond the classifier.
- **Cost & observability (slice E)**: real token instrumentation, budgets, dashboard.
