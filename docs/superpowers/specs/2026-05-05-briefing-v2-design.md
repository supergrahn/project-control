# Briefing v2 Design — action-oriented, per-project, pre-computed

Evolves the existing `/briefing` page (shipped 2026-05-05) from a live read-only signal dashboard into an action-oriented, per-project-aware, locally-precomputed morning briefing.

## What's there today (recap)

- `/briefing` aggregates 5 sections live from SQLite each request (60s SWR refresh)
- Cross-project only — no project filter
- Click an item → deep link to its detail surface; no in-place actions
- No precomputation, no LLM curation

## What v2 adds

1. **Per-project filter** — `/briefing?projectId=<id>` filters all five sections; project picker dropdown drives URL state
2. **One in-place action per section** — Continue / Fix / Start / Continue / Dismiss, per the table below
3. **Overnight LLM synthesis** — `briefing_synthesize` job runs at 5–6am local + on material signal change + on lazy fallback when user opens a stale briefing. Local LLM (`localComplete`) reads the same signal and emits a structured `{ narrative, priority_actions }` snapshot stored in a new `briefing_snapshots` table. UI renders a hero block at the top of `/briefing` showing the narrative + a small list of LLM-prioritised actions.

## Non-goals

- Cron scheduler infrastructure (we extend the existing tick-loop with an idempotent enqueue check; no new scheduling primitive)
- Editable narratives, multi-version history, or tone/style configuration
- Email/push notification of the morning briefing
- Replacing the live dashboard — the live grid stays underneath the hero
- Cross-section action workflows (e.g. "merge these 3 things") — out of scope

---

## Architecture

```
                 ┌────────────────────────────────────────┐
                 │  Scheduler tick (existing 15s loop)    │
                 │  + briefingPreWarmTrigger()            │
                 │  if local hour ∈ {5,6} and no fresh    │
                 │  snapshot per scope:                   │
                 │    enqueueJob('briefing_synthesize',   │
                 │      { scope }, dedupKey)              │
                 └─────────────────┬──────────────────────┘
                                   │
                                   ▼
                 ┌────────────────────────────────────────┐
                 │  briefing_synthesize handler           │
                 │  1. computeBriefing(db, scope) — reuse │
                 │     existing 5 aggregators             │
                 │  2. localComplete(prompt) → JSON       │
                 │  3. UPSERT briefing_snapshots row      │
                 └─────────────────┬──────────────────────┘
                                   │
                                   ▼
            ┌──────────────────────────────────────────────────┐
            │  GET /api/briefing?projectId=<id>                │
            │  Returns: { snapshot, sections, generatedAt,     │
            │             snapshotStale, model }               │
            │  Side-effect: lazy enqueue if snapshot is stale  │
            └─────────────────┬────────────────────────────────┘
                              │
                              ▼
            ┌──────────────────────────────────────────────────┐
            │  BriefingPage                                    │
            │  • ProjectPicker (URL-driven)                    │
            │  • Hero (narrative + priority actions)           │
            │  • Existing 5-section grid below                 │
            │  • Each section item: existing link + new action │
            │    button (Continue / Fix / Start / Dismiss)     │
            └──────────────────────────────────────────────────┘
```

---

## Data model

### Migration 73: `dedup_dismissals`

```sql
CREATE TABLE dedup_dismissals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    TEXT    NOT NULL REFERENCES projects(id),
  a_task_id     TEXT    NOT NULL,
  b_task_id     TEXT    NOT NULL,
  dismissed_at  TEXT    NOT NULL,
  UNIQUE(project_id, a_task_id, b_task_id)
);
CREATE INDEX idx_dedup_dismissals_project ON dedup_dismissals(project_id);
```

Pairs are stored with `a_task_id < b_task_id` lexicographically (canonicalised at insert time) so the same pair is never stored twice as `(A,B)` and `(B,A)`. The duplicate aggregator excludes any pair found in this table for the relevant project.

### Migration 74: `briefing_snapshots`

```sql
CREATE TABLE briefing_snapshots (
  scope_key         TEXT PRIMARY KEY,           -- '__all__' or projectId
  project_id        TEXT REFERENCES projects(id),  -- NULL for cross-project
  narrative         TEXT NOT NULL,
  priority_actions  TEXT NOT NULL,              -- JSON array
  section_signature TEXT NOT NULL,              -- hash of section data at generation time
  model             TEXT NOT NULL,              -- LLM model name from getLocalModelName()
  generated_at      TEXT NOT NULL
);
```

UPSERT-only — one current row per scope. Older snapshots are overwritten. No history retention (out of scope).

`scope_key` is the primary key. `project_id` is a separate column for FK and for ease of joining.

Use `INSERT INTO briefing_snapshots (...) VALUES (...) ON CONFLICT(scope_key) DO UPDATE SET ...` for the UPSERT (matches the existing `critique.ts` precedent and avoids the DELETE+INSERT semantics of `INSERT OR REPLACE`, which would regenerate rowid).

### `JobKind` union extension

`lib/jobs/runner.ts` line 4 currently defines:
```ts
export type JobKind =
  | 'embed' | 'grade_session' | 'extract_next_actions'
  | 'critique_spec' | 'critique_plan' | 'refresh_prep'
```
Add `'briefing_synthesize'` to this union — REQUIRED before `enqueueJob` or `registerHandler` calls referencing the new kind will compile.

### `priority_actions` JSON shape

```ts
type PriorityAction = {
  sectionKey: 'next_actions' | 'critic_flagged' | 'top_tasks' | 'recent_failures' | 'duplicate_tasks'
  refId: string  // sessionId, finding id, taskId, sessionId, "{aId}::{bId}"
  reason: string  // 1-2 sentence LLM-generated rationale
}
```

The handler validates the LLM's structured output: array length 0–6, each item has both keys, `sectionKey` is one of the five literals, `refId` is a string. Items that fail validation are dropped silently.

### `section_signature`

A SHA-256 hex digest over a stable serialization of the five section payloads (item refIds + counts, NOT full bodies — keeps hash stable across cosmetic changes like timestamp drift). Stored alongside the snapshot. The `briefingPreWarmTrigger` uses it to skip re-synthesis when nothing material has changed since the last snapshot.

---

## Aggregator changes

Each of the five existing aggregators in `lib/briefing/` gains an optional `projectId?: string` parameter. SQL appends `AND project_id = ?` when set; aggregator signatures stay otherwise identical. No breaking change for existing callers (parameter is optional).

Specific changes per aggregator:

- `openNextActions`: filters `sessions.project_id = ?` when set
- `criticFlagged`: filters `critic_findings.project_id = ?` when set
- `topTasks`: filters `tasks.project_id = ?` when set
- `recentFailures`: filters `sessions.project_id = ?` when set
- `duplicateTasks`: when `projectId` is set, only that project's embeddings are scanned. Always (even for cross-project), the aggregator filters out pairs present in `dedup_dismissals`. **Cross-project semantics:** dismissals are stored with `project_id` set to the project that owns both tasks (the aggregator only ever produces same-project pairs because embeddings are grouped by project_id when computing pairwise similarity). So the suppression is naturally scoped: dismissing pair (A, B) in project P1 only suppresses that pair when the cross-project briefing computes P1's pairs. It does NOT suppress lookups in other projects.

---

## API

### `GET /api/briefing?projectId=<id>?` (modified)

Existing route at `app/api/briefing/route.ts` is extended to:

1. Read `projectId` from search params (`null` → cross-project, `'__all__'` is also accepted as cross-project for clarity)
2. Pass `projectId` through to the five aggregators (existing `tryResolve` wrapper preserved)
3. Read the snapshot row for this scope (`scope_key = projectId ?? '__all__'`)
4. Compute `snapshotStale` — `true` if no snapshot OR `generated_at` older than 18 hours OR section_signature differs from current
5. If `snapshotStale` is true, lazy-enqueue a `briefing_synthesize` job with **dedup_key `briefing_synthesize:${scope}:${today}`** — the same key used by the morning pre-warm. This deliberately collapses pre-warm and lazy enqueue into one job per scope per day. Material-change events use distinct suffixed keys (`:gradechange`, `:criticchange`) so they can fire on top of the daily pre-warm/lazy. Multi-tab concurrent loads all hit the same dedup key and only the first enqueues real work.
6. Return `{ openNextActions, criticFlagged, topTasks, recentFailures, duplicateTasks, snapshot, snapshotStale, generatedAt }` where `snapshot` is `{ narrative, priorityActions, generatedAt, model }` or `null`

Side-effect of lazy-enqueue is intentional: visiting the page during the day refreshes the narrative if signal has materially changed. Dedup_key prevents duplicate work.

### `POST /api/critic-findings/[id]/fix`

New route. **The `[id]` segment is an INTEGER autoincrement (`critic_findings.id`)** — coerce the URL string with `parseInt(id, 10)` before the SQLite lookup. Reject `NaN` with 400.

Body: `{ category: string; message: string; severity: 'critical' | 'high' }` — the UI sends back the specific issue the user clicked on (the section flattens one finding row into N issue items, so the `id` alone is ambiguous). The route validates the trio matches an issue inside the stored `findings.issues` array; if no match, returns 400. Response `{ sessionId }`.

**Findings JSON shape (verified against `lib/jobs/handlers/critique.ts:96-101`):**
The `findings` column stores `{ issues: Issue[], votes: number, model: string, run_at: string }` — a wrapper object, NOT the array directly. The route accesses `JSON.parse(row.findings).issues` to get the array of `{severity, category, message}` items.

Looks up the finding (`SELECT * FROM critic_findings WHERE id = ?`), parses `findings` and finds the issue matching `(category, message, severity)`. Builds a userContext block:

```
<!-- briefing-fix:auto -->
## Critic finding to address

**Kind:** spec | plan
**File:** path/to/file
**Severity:** critical | high
**Category:** ...
**Message:** ...
```

Then calls `spawnSession`:
- `phase`: `'spec'` if `kind === 'spec'`, `'plan'` if `kind === 'plan'`, else 400
- `sourceFile`: the finding's `ref` (treat as relative-to-project path; resolve via `path.join(project.path, ref)` if not absolute)
- `taskId`: null (critic findings are file-scoped, not task-scoped)
- `userContext`: the marker block above
- `label`: `Fix critic finding: <category>`

**Validation order (route must enforce in this order so errors are deterministic):**
0. `const body = await req.json().catch(() => null)` — if `body === null` OR `typeof body !== 'object'`, return 400 "invalid JSON body". This early-return is required BEFORE any destructuring; a fresh route handler that reads `const { category } = body` against a null `body` will throw a TypeError instead of returning 400.
1. `parseInt(id, 10)` → 400 if `NaN`
2. Body must include non-empty `category`, `message`, `severity`; reject 400 if any is missing or empty string
3. `severity` must be `'critical'` or `'high'`; reject 400 otherwise
4. SELECT finding → 404 if missing
5. `kind` must be `'spec'` or `'plan'`; reject 400 otherwise
6. Trio `(category, message, severity)` must match an entry in the parsed `findings.issues` array; reject 400 otherwise
7. Spawn session → 409 on `CONCURRENT_SESSION:` throw (same pattern as `/api/sessions/[id]/continue`)

**Aggregator change consequence:** the existing `criticFlagged.ts` aggregator must be updated to include `cf.id AS finding_id` in the SELECT and propagate it to the `BriefingCriticFlag` type (new field `findingId: number`). The UI sends `findingId + (severity, category, message)` to the route. Add `findingId: number` to `BriefingCriticFlag` in `lib/briefing/types.ts`.

### `POST /api/tasks/[id]/start`

New route. Body empty. Response `{ sessionId }`.

Looks up the task (`getTask`), maps status to phase:
- `idea` → `brainstorm`
- `spec` → `spec`
- `plan` → `develop`
- anything else → 400 ("task is not in a startable phase")

Spawns a session with that phase, `taskId = source.id`, `sourceFile = source.idea_file ?? source.spec_file ?? source.plan_file ?? null`, `userContext = ''` (the existing `prepUserContext` and slice-1 next-actions injection in `spawnSession` will populate it). 404 if task doesn't exist, 409 on concurrent collision (same translation).

### `POST /api/dedup-dismissals`

New route. Body: `{ projectId: string; aTaskId: string; bTaskId: string }`. Response `{ ok: true }` or `{ error }`.

Canonicalises the pair (sorts ids lexicographically) and inserts `INSERT OR IGNORE` so calling twice is idempotent. Returns 400 if any field missing or task ids are equal.

### Continue endpoints (reused, no changes)

`/api/sessions/[id]/continue` from slice 1 powers both the "Continue" action on next-actions section AND the "Continue" action on recent-failures section. No new endpoint needed.

---

## `briefing_synthesize` job handler

`lib/jobs/handlers/briefing_synthesize.ts`:

```ts
type Payload = { scope: string }  // '__all__' or projectId

export async function handleBriefingSynthesize(db: Database, payload: Payload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[briefing_synthesize] no local provider; skipping')
    return
  }
  const projectId = payload.scope === '__all__' ? undefined : payload.scope
  const sections = computeBriefingSections(db, projectId)  // reuses existing aggregators
  const signature = sectionSignature(sections)
  const existing = db.prepare(`SELECT section_signature FROM briefing_snapshots WHERE scope_key = ?`)
    .get(payload.scope) as { section_signature: string } | undefined
  if (existing?.section_signature === signature) {
    console.log(`[briefing_synthesize] no material change for ${payload.scope}; skipping LLM`)
    return
  }

  const prompt = buildBriefingPrompt(sections)
  // localComplete signature (verified against lib/router/localComplete.ts):
  // takes (provider, prompt, { maxTokens, timeoutMs }) — temperature is hardcoded
  // to 0 inside the function body, so we cannot pass it here.
  const llmJson = await localComplete(provider, prompt, { maxTokens: 1200, timeoutMs: 60_000 })
  const parsed = parseBriefingJson(llmJson)
  if (!parsed) {
    console.warn(`[briefing_synthesize] LLM output unparseable for ${payload.scope}; storing fallback`)
    // Defensive fallback: store an empty narrative so the page can render the live grid below
    db.prepare(`
      INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, '', '[]', ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        narrative = excluded.narrative,
        priority_actions = excluded.priority_actions,
        section_signature = excluded.section_signature,
        model = excluded.model,
        generated_at = excluded.generated_at
    `).run(payload.scope, projectId ?? null, signature, getLocalModelName(provider), new Date().toISOString())
    return
  }

  db.prepare(`
    INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      narrative = excluded.narrative,
      priority_actions = excluded.priority_actions,
      section_signature = excluded.section_signature,
      model = excluded.model,
      generated_at = excluded.generated_at
  `).run(
    payload.scope,
    projectId ?? null,
    parsed.narrative,
    JSON.stringify(parsed.priorityActions),
    signature,
    getLocalModelName(provider),
    new Date().toISOString(),
  )
}
```

### Prompt structure

```
You are the user's morning briefing assistant for a software project. You are given five
sections of signal aggregated from the last few days of work. Your job is to write a brief
prioritisation that helps the user decide where to focus.

Output strict JSON with this shape:

{
  "narrative": "3-5 sentence prose summary prioritising the most important items.",
  "priority_actions": [
    { "sectionKey": "next_actions" | "critic_flagged" | "top_tasks" | "recent_failures" | "duplicate_tasks",
      "refId": "the item's id (sessionId, criticFindingId, taskId, sessionId, or 'aId::bId' for duplicates)",
      "reason": "1-2 sentence rationale" }
  ]
}

Aim for 3-5 priority_actions. Pick across sections. Skip sections that have no items.
Do not include any text outside the JSON object. Do not invent ids — only use ones present
in the data below.

DATA:
[serialised sections with refIds, titles, severities, etc. — token-bounded]
```

### Robust JSON parsing

`parseBriefingJson(raw)`:
1. Try `JSON.parse(raw)`
2. If that fails, look for the first `{` and last `}` and try parsing the substring
3. If that fails, return `null`
4. Validate `narrative` is a non-empty string and `priority_actions` is an array
5. Filter `priority_actions` to drop entries with invalid `sectionKey`, missing `refId`, missing `reason`, or `refId` not present in the corresponding section's data
6. Cap to 6 items

Returning `null` triggers the fallback stored-empty-snapshot path so the page degrades gracefully.

### `sectionSignature(sections)`

```ts
function sectionSignature(s: BriefingSections): string {
  const ids = {
    next: s.openNextActions.map(x => x.sessionId).sort(),
    critic: s.criticFlagged.map(x => `${x.kind}:${x.ref}:${x.severity}:${x.message.slice(0, 40)}`).sort(),
    top: s.topTasks.map(x => x.taskId).sort(),
    fail: s.recentFailures.map(x => x.sessionId).sort(),
    dup: s.duplicateTasks.map(x => `${x.aTaskId}::${x.bTaskId}`).sort(),
  }
  return crypto.createHash('sha256').update(JSON.stringify(ids)).digest('hex')
}
```

The signature captures *which items would be shown*. It deliberately does NOT include similarity scores, generation timestamps, or counts — those drift continuously and would invalidate the snapshot on every tick.

---

## Scheduler trigger

`lib/jobs/triggers/briefingPreWarm.ts`:

```ts
export function briefingPreWarmTrigger(db: Database): void {
  // Test environments: skip. The scheduler is already env-gated in server.ts,
  // but unit tests that import runOneBatch directly should not exercise this trigger.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return

  const hour = new Date().getHours()
  if (hour < 5 || hour > 6) return  // Only fire in the 5-6am window

  const today = new Date().toISOString().slice(0, 10)
  const projects = db.prepare(`SELECT id FROM projects`).all() as Array<{ id: string }>
  const scopes = ['__all__', ...projects.map(p => p.id)]

  for (const scope of scopes) {
    const snap = db.prepare(`SELECT generated_at FROM briefing_snapshots WHERE scope_key = ?`)
      .get(scope) as { generated_at: string } | undefined
    if (snap && snap.generated_at.slice(0, 10) === today) continue  // already fresh today
    enqueueJob(db, 'briefing_synthesize', { scope }, { dedupKey: `briefing_synthesize:${scope}:${today}` })
  }
}
```

Called from the scheduler tick. **Concrete edit to `lib/jobs/runner.ts`:**

The existing `startScheduler` (lines 112-129 of `lib/jobs/runner.ts`) wraps each tick in a try/catch around `runOneBatch`. Modify the `tick` function to call `briefingPreWarmTrigger(opts.getDb())` immediately before `runOneBatch`:

```ts
// lib/jobs/runner.ts — modified tick
const tick = async () => {
  if (stopped) return
  try {
    briefingPreWarmTrigger(opts.getDb())  // idempotent; env-guarded internally
    await runOneBatch(opts.getDb(), { batchSize: opts.batchSize, loadAverageMax: opts.loadAverageMax })
  } catch (err) {
    console.warn('[jobs] tick error:', err)
  }
}
```

The trigger is idempotent at three layers: (1) env-gate skips test envs entirely, (2) hour check returns early outside 5-6am, (3) dedup_key prevents duplicate enqueues within the same scope+day. Out-of-window calls and same-window repeated calls are both no-ops.

If the user does not have the dev server running between 5-6am, the briefing simply won't pre-warm — lazy fallback covers it on first page-load that day.

---

## UI

### `BriefingPage` extension

The existing `BriefingPage` (in `components/briefing/BriefingPage.tsx`) is extended with:

1. **`ProjectPicker`** at the top — dropdown listing all projects + an "All projects" item. URL-driven via search params (`?projectId=`). Reads from a small `useProjects()` hook (already exists in `@/hooks/useProjects`).
2. **`BriefingHero`** above the existing grid — renders the snapshot's narrative + priority actions list. If `snapshot` is `null` AND `snapshotStale` is true, shows "Synthesizing morning briefing…" with a small spinner. If `snapshot` exists, shows narrative + actions + footer "Generated 4h ago by llama3 · Refresh now". The "Refresh now" button kicks an immediate synthesis via `POST /api/briefing/refresh?scope=...` and then disables itself until SWR returns a snapshot with a newer `generated_at`.

   **`useBriefing` hook signature (extended):**
   ```ts
   // hooks/useBriefing.ts
   export function useBriefing(projectId?: string) {
     const url = projectId ? `/api/briefing?projectId=${projectId}` : '/api/briefing'
     return useSWR<BriefingResponse>(url, fetcher, {
       refreshInterval: (latest: BriefingResponse | undefined) => {
         // Faster polling while waiting for the synthesis job to land:
         // null snapshot + stale → 5s; otherwise default 60s
         if (latest && latest.snapshot === null && latest.snapshotStale) return 5_000
         return 60_000
       },
       revalidateOnFocus: true,
     })
   }
   ```

   This uses SWR's function form for `refreshInterval` (introduced in SWR 2.x) so the hook itself owns the polling-rate decision based on the most recent fetch result. No caller-side state management. `BriefingPage` calls `useBriefing(projectId)` where `projectId` is read from URL search params via `useSearchParams()`. The hook is the single source of truth for the polling interval.

   **Stale `refId` in priority actions:** between synthesis and render, items can be deleted (a session was killed, a task archived, etc.). The hero resolves each `priorityAction.refId` against the live section data returned by the same GET response. Entries whose `refId` is no longer present in the corresponding section silently drop out of the rendered list. The same-day dedup_key prevents thrashing the LLM to regenerate immediately; the next day's pre-warm or a material-change event will fix it.
3. The existing 5-section grid is unchanged structurally but each section component receives one additional prop: an action handler (Continue / Fix / Start / Dismiss). The action button is rendered inline next to the existing item content.

`PriorityAction` items in the hero render with the same action button as the underlying section item — clicking "Continue" on a priority-action that points to a next-action item runs the same `POST /api/sessions/[id]/continue` it would in the section grid. The hero is a curated entry point, not a different surface.

### `POST /api/briefing/refresh?scope=<id?>`

Tiny route. Reads `scope` (defaults to `__all__`), enqueues a `briefing_synthesize` job for that scope with **dedup_key `briefing_synthesize:${scope}:${today}:force`** (fixed `:force` suffix, NOT a per-click timestamp). This collapses button-spam within the same day to a single job. The button itself is also disabled in the UI from click until SWR's next successful refetch returns a new `generated_at`, so the user can't fire a second click before the first completes anyway — but the fixed dedup key is the correctness guarantee. Returns 202 with `{ ok: true }`.

### Section action wiring

Each section component gets a small `onAction(item)` prop. The `BriefingPage` provides handler functions that call the appropriate API:

- `OpenNextActionsSection.onAction` → POST `/api/sessions/{sessionId}/continue`, navigate to `/sessions?selected=<newId>`
- `CriticFlaggedSection.onAction` → POST `/api/critic-findings/{findingId}/fix` with body `{ category, message, severity }`, navigate to `/sessions?selected=<newId>`. Requires the aggregator change documented above (include `findingId: number` on each `BriefingCriticFlag` item).
- `TopTasksSection.onAction` → POST `/api/tasks/{taskId}/start`, navigate to `/sessions?selected=<newId>`
- `RecentFailuresSection.onAction` → POST `/api/sessions/{sessionId}/continue`, navigate to `/sessions?selected=<newId>`
- `DuplicateTasksSection.onAction` → POST `/api/dedup-dismissals` with `{ projectId, aTaskId, bTaskId }`, then revalidate the `/api/briefing` SWR cache so the dismissed pair disappears

Each action button shows a brief pending state (`Spawning…`, `Dismissing…`) and an inline error if the request fails.

---

## Material-change invalidation

When new bad news arrives mid-day, the snapshot should refresh. We **add two new enqueue calls** to existing handlers (these calls do not currently exist):

1. **Session graded `no`** — in `lib/jobs/handlers/grade_session.ts`, after the existing `UPDATE sessions SET grade = ?` statement (around line 73), check the parsed grade. If `grade === 'no'`, add:
   ```ts
   const today = new Date().toISOString().slice(0, 10)
   enqueueJob(db, 'briefing_synthesize', { scope: '__all__' }, { dedupKey: `briefing_synthesize:__all__:${today}:gradechange` })
   enqueueJob(db, 'briefing_synthesize', { scope: session.project_id }, { dedupKey: `briefing_synthesize:${session.project_id}:${today}:gradechange` })
   ```

2. **New critic finding with severity ∈ {critical, high}** — in `lib/jobs/handlers/critique.ts`, after the existing `INSERT INTO critic_findings ... ON CONFLICT DO UPDATE` (lines 104-110), inspect the `merged` issues array. If any issue has `severity === 'critical' || severity === 'high'`, add:
   ```ts
   const today = new Date().toISOString().slice(0, 10)
   enqueueJob(db, 'briefing_synthesize', { scope: '__all__' }, { dedupKey: `briefing_synthesize:__all__:${today}:criticchange` })
   enqueueJob(db, 'briefing_synthesize', { scope: payload.project_id }, { dedupKey: `briefing_synthesize:${payload.project_id}:${today}:criticchange` })
   ```

Note the dedup_keys differ from the daily pre-warm key (`...:${today}` without suffix) — the `:gradechange` and `:criticchange` suffixes ensure each material event can trigger its own re-synthesis once per day per scope, without colliding with the morning pre-warm. Within a single day, multiple grade-changes still collapse to one job (good — bounds LLM cost). The handler's `section_signature` short-circuit will then skip the LLM call if no item set actually changed.

For mid-day mid-conversation immediate effect, the lazy enqueue on `GET /api/briefing` (when snapshot is signature-stale) achieves the same effect when the user reloads. Combined: pre-warm, lazy refresh on signature drift, and post-event enqueue cover all the cases without spamming the LLM.

---

## Tests

### Aggregators
- Each aggregator gains 1-2 tests covering the new `projectId` parameter (filtered vs unfiltered)
- `criticFlagged` gains a test asserting the new `findingId: number` field is populated correctly (matches the source `critic_findings.id`)
- `duplicateTasks` adds 1 test confirming `dedup_dismissals` exclusion: insert a dismissal for pair (A, B) in project P1; verify the aggregator does not return that pair while still returning other pairs in the same project

### Job handler
- `lib/jobs/handlers/__tests__/briefing_synthesize.test.ts`:
  - Aborts with warning when no local provider configured
  - Skips LLM when `section_signature` matches existing snapshot
  - Stores fallback empty narrative when LLM returns unparseable JSON
  - Stores parsed narrative + priority_actions on success
  - Filters out priority_actions with invalid sectionKey / unknown refId
  - UPSERT replaces existing snapshot row

### Pure helpers (in same test file or split out)
- `parseBriefingJson` direct tests:
  - Returns null for plain bad JSON
  - Salvages JSON when wrapped in prose (extracts first `{` to last `}` substring)
  - Returns null when narrative is missing or not a string
  - Returns null when priority_actions is not an array
  - Filters individual priority_actions that fail validation but keeps valid ones
  - Caps to 6 items
- `sectionSignature` direct tests:
  - Same item set in different array orders produces the same hash (the JS `.sort()` calls inside the function guarantee this)
  - Different item sets produce different hashes
  - Empty sections produce a stable hash

### Scheduler trigger
- `lib/jobs/triggers/__tests__/briefingPreWarm.test.ts`:
  - **No-op when `process.env.VITEST === 'true'`** (regression guard for the env-gate)
  - No-op outside 5-6am window (set hour via `vi.setSystemTime`)
  - Enqueues per-project + `__all__` jobs at 5am when no snapshot exists
  - Skips scopes with snapshot generated today
  - Idempotent (second call within same tick doesn't enqueue duplicates due to dedup_key)

### Routes
- `app/api/critic-findings/[id]/fix/__tests__/fix.test.ts`: parseInt fail → 400; missing/empty body field → 400; severity ∉ {critical, high} → 400; finding not found → 404; kind not spec/plan → 400; trio not in stored issues → 400; concurrent collision → 409; happy path → 200 with new sessionId
- `app/api/tasks/[id]/start/__tests__/start.test.ts`: 404 / 400 (status not idea/spec/plan) / 200 with correct phase derivation
- `app/api/dedup-dismissals/__tests__/dismissals.test.ts`: 400 (missing field) / 400 (a == b) / 200 / 200 idempotent (second call no-op due to UNIQUE) / canonicalisation (POSTing (B,A) stores (A,B))
- `app/api/briefing/route.test.ts` (extended): `projectId` filter passed through; snapshot returned; lazy enqueue when stale (uses pre-warm dedup_key, so same-day repeated GETs collapse to one job)
- `app/api/briefing/refresh/__tests__/refresh.test.ts`: enqueues with `:force` dedup_key; spam-clicks collapse to one job per day per scope; 202 status

### UI
- `BriefingPage.test.tsx`: project picker renders; URL-driven state; hero renders narrative when snapshot present; "Synthesizing…" state when null + stale; action buttons render and trigger correct API
- Each section component gains tests for its action button visible state + click behavior

Target: ~60 new tests on top of 1161 = ~1221 total.

---

## Migrations summary

- **73**: `dedup_dismissals` table + index
- **74**: `briefing_snapshots` table

Both are idempotent CREATE-IF-NOT-EXISTS. No CHECK widening needed.

---

## Risks

- **Local LLM JSON brittleness** — defensive parsing handles malformed output via fallback empty narrative. Smoke test should confirm the fallback path renders the live grid as expected.
- **LLM latency** — synthesis can take 10-30s on a CPU-only machine. UI handles via Synthesizing… state; user can scroll the live grid while waiting.
- **5-6am hour window assumes local time** — uses `new Date().getHours()` which honors the server's TZ. If the server is UTC and the user is e.g. PST, the briefing will run at 9-10pm PST. A future improvement is per-user-timezone, but for v1 the user can adjust the window in code.
- **Scope key collision** — `'__all__'` is a sentinel string. Since `createProject` (`lib/db.ts:526-534`) generates ids internally via `randomUUID()` (always 36-char hyphenated UUIDs), no user-supplied flow can produce a project id equal to `'__all__'`. The collision is structurally impossible given the current ID-generation contract; no extra guard is needed. If a future migration ever introduces caller-supplied project ids, this risk re-opens.
- **Snapshot retention** — UPSERT-only means we lose history. If a user wants to compare yesterday's vs today's narrative, they can't. Out of scope; explicit non-goal above.
- **Material-change cascade** — every session graded `no` and every critical finding enqueues a synthesis job. With dedup keyed on `(scope, date)`, this is bounded to 1 job per scope per day. If we later want immediate per-event refresh, switch to a finer dedup_key.

---

## What's NOT changing

- The five aggregator algorithms themselves (only the optional `projectId` param is added)
- The existing `/briefing` URL (unchanged; `?projectId` is additive)
- The existing live SWR refresh pattern (60s)
- The Sidebar Global section (Briefing link unchanged; per-project briefing is reached via the dropdown)
- Slice 1's session continue endpoint (reused for two of the action buttons)
