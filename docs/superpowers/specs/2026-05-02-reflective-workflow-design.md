# Reflective Workflow — Design Spec

**Date:** 2026-05-02
**Branch:** `feature/reflective-workflow`
**Status:** Draft

## Goal

Turn every completed session into compounding signal. Six pieces ship together because they share infrastructure (a job queue, an embedding index, a llama.cpp client for embeddings) and because each piece on its own is incomplete leverage:

1. **Session grader** — at session-end, the local LLM grades outcome quality and feeds the result back into the router's success-rate.
2. **Next-actions extractor** — parses the captured `summary` into structured `{ next_actions[], open_questions[], files_touched[] }`.
3. **Originator-aware prep refresh** — when a session reports `files_touched`, re-fires `prepareTask` for any task whose `idea_file` references those paths.
4. **Project-wide embedding index** — every doc, spec, plan, and captured summary indexed via llama.cpp's `/v1/embeddings`. Stored as Float32 bytes in SQLite. Powers similarity queries everywhere downstream.
5. **Critic ensemble for specs and plans** — three local-LLM passes against a structured rubric → majority vote → persisted findings rendered inline in the docs view.
6. **Idle-time batch runner** — SQLite-backed job queue with a small in-process scheduler. All five items above enqueue work here; the runner drains it under a load-average threshold so user-facing latency is unaffected.

## Non-Goals

- No Ollama-specific code paths. Local LLM access stays OpenAI-compatible HTTP via `localComplete`; the same provider config works for whichever server the user runs (llama.cpp `llama-server` or anything else that exposes `/v1/chat/completions` and `/v1/embeddings`).
- No vector database. Cosine similarity over Float32 arrays in SQLite is sufficient at the project's scale (typical: hundreds to low-thousands of indexed items per project). HNSW / Faiss / pgvector are out of scope.
- No multi-tenancy concerns for the job queue. Single-user local app; one Next.js process; one scheduler.
- No backfill of grades / next_actions for historical sessions in the migration. The job queue can pick up backfill work on demand if explicitly invoked, but startup doesn't enqueue thousands of grade jobs against existing rows.
- No critic-driven blocking of spec/plan writes. Critics run async; findings are advisory.
- No agent-intent live inference, no synthetic-PM mode, no auto-decompose. Those are separate future slices that compose with the embedding index but aren't shipped here.

## Architecture

### 0. Schema additions

Seven migrations land together (65–71). Last existing migration is 64 (`sessions_summary`). Each is additive and idempotent (`runMigration(..., true)` for nullable column adds; standalone `CREATE TABLE` for new tables). The session-column adds (grade / grade_reason / graded_at / next_actions) are split one-ALTER-per-version following the established pattern (migrations 25-27, 58-60, 61-63 all do this) — combining ALTERs in one version risks a half-applied state when `tolerateExisting` absorbs a duplicate-column error before later ALTERs in the same exec run.

**Migration 65 — `pending_jobs` table** (the idle batch runner's queue):

```sql
CREATE TABLE IF NOT EXISTS pending_jobs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT    NOT NULL,            -- 'embed' | 'grade_session' | 'extract_next_actions' | 'critique_spec' | 'critique_plan' | 'refresh_prep'
  payload      TEXT    NOT NULL,            -- JSON, kind-specific shape
  dedup_key    TEXT,                        -- caller-supplied stable key, e.g. 'embed:proj-1:doc:specs/foo.md'; nullable for jobs without dedup
  state        TEXT    NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'failed' | 'done'
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  scheduled_at TEXT    NOT NULL,
  started_at   TEXT,
  finished_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_pending_jobs_state_scheduled
  ON pending_jobs(state, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pending_jobs_dedup_pending
  ON pending_jobs(dedup_key) WHERE state = 'pending';  -- partial index — only 'pending' rows are checked for dedup
```

The `dedup_key` is a deterministic string the caller provides (NOT a JSON serialization of payload, which has key-ordering hazards). Convention: `<kind>:<project>:<ref>` for embed jobs, `<kind>:<session_id>` for session jobs, `<kind>:<task_id>` for task jobs. The partial index ensures dedup lookups stay fast even as `done`/`failed` rows accumulate.

**Migration 66 — `embeddings` table:**

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT    NOT NULL REFERENCES projects(id),
  kind         TEXT    NOT NULL,            -- 'doc' | 'spec' | 'plan' | 'session_summary' | 'task'
  ref          TEXT    NOT NULL,            -- 'docs/foo.md' | session id | task id
  content_hash TEXT    NOT NULL,            -- sha256 of the text we embedded; lets us skip re-embed when unchanged
  vector       BLOB    NOT NULL,            -- Float32Array bytes; length = dim * 4
  dim          INTEGER NOT NULL,            -- embedding dimensionality (e.g. 768 for nomic-embed-text-v1.5)
  model        TEXT    NOT NULL,            -- model id used to compute; (model, dim) is the consistency key for cosine math
  updated_at   TEXT    NOT NULL,
  UNIQUE(project_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_project_kind ON embeddings(project_id, kind);
```

The `kind` column accepts `'task'` — the Tasks-page dedup hint (§9e) embeds task title+description.

**Roundtrip note:** when reading `vector` back as a `Buffer` from better-sqlite3, the implementer MUST construct the Float32Array via `new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)` to avoid an O(n) copy. `new Float32Array(buf)` would copy and silently drop bytes if `byteLength` isn't a multiple of 4.

**Migrations 67-69 — `sessions.grade` columns** (split one-ALTER-per-version):

```sql
-- Migration 67
ALTER TABLE sessions ADD COLUMN grade TEXT;            -- 'yes' | 'partial' | 'no'
-- Migration 68
ALTER TABLE sessions ADD COLUMN grade_reason TEXT;     -- 1-2 sentence rationale
-- Migration 69
ALTER TABLE sessions ADD COLUMN graded_at TEXT;
```

**Migration 70 — `sessions.next_actions` (TEXT, JSON):**

```sql
ALTER TABLE sessions ADD COLUMN next_actions TEXT;     -- JSON: { next_actions: string[], open_questions: string[], files_touched: { path: string, change: string }[], extracted_at: string, model: string }
```

**Migration 71 — `critic_findings` table:**

```sql
CREATE TABLE IF NOT EXISTS critic_findings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT    NOT NULL REFERENCES projects(id),
  kind         TEXT    NOT NULL,            -- 'spec' | 'plan'
  ref          TEXT    NOT NULL,            -- relative path of the spec/plan
  content_hash TEXT    NOT NULL,            -- sha256 of the file when critiqued; render only if matches current
  findings     TEXT    NOT NULL,            -- JSON: { issues: { severity: 'critical'|'important'|'minor', category: string, message: string, line_hint?: number }[], votes: 1|2|3, model: string, run_at: string }
  created_at   TEXT    NOT NULL,
  UNIQUE(project_id, kind, ref)             -- one row per file; replaced on re-critique
);
```

**Settings sentinel for one-time work** (no new migration — uses an existing pattern). The codebase doesn't have a generic `settings` key/value table. Instead, the one-time startup index sweep uses a sentinel row in `schema_migrations` (e.g., version `999_001` named `'sweep_initial_embeddings'`). This is unconventional but avoids a new table for one boolean.

### 1. Llama.cpp embedding client

**File:** `lib/router/localEmbed.ts` (sibling to `localComplete.ts`)

Same OpenAI-compatible-HTTP pattern as `localComplete`. The provider config gains an optional `embeddingModel` field; if absent, defaults to `nomic-embed-text-v1.5`.

```ts
export type LocalEmbedOpts = { timeoutMs: number }

export async function localEmbed(
  provider: Provider,
  inputs: string[],
  opts: LocalEmbedOpts,
): Promise<{ embeddings: Float32Array[]; model: string; dim: number }>

export function getLocalEmbeddingModel(provider: Provider): string
```

Implementation:
- POST to `${baseUrl}/embeddings` with `{ model, input: inputs }` (OpenAI-compatible — llama.cpp's `llama-server` and Ollama both accept this shape).
- Response: `{ data: [{ embedding: number[] }, ...], model }`. Convert each `number[]` to `Float32Array`.
- Throw on non-2xx, abort on timeout. Same try/catch surface area as `localComplete`.
- Returns `dim` so callers can store it without re-introspecting (`embeddings[0].length`).

**Provider config refactor:** `parseConfig` currently lives privately inside `lib/router/localComplete.ts`. As part of this slice, extract it to a shared module `lib/router/providerConfig.ts` exporting `parseLocalProviderConfig(provider) → { baseUrl?: string; model?: string; embeddingModel?: string }`. Both `localComplete` and `localEmbed` import from there. Backward-compatible (existing `parseConfig` usage moves to the shared helper; same JSON shape, just reads one extra optional key).

### 2. Idle-time batch runner

**File:** `lib/jobs/runner.ts`. Configuration (env defaults) lives in `lib/jobs/config.ts` as the single source of truth.

```ts
type JobKind =
  | 'embed'                  // payload: { project_id, kind: 'doc'|'spec'|'plan'|'session_summary'|'task', ref, content_hash }
  | 'grade_session'          // payload: { session_id }
  | 'extract_next_actions'   // payload: { session_id }
  | 'critique_spec'          // payload: { project_id, ref, content_hash }
  | 'critique_plan'          // payload: { project_id, ref, content_hash }
  | 'refresh_prep'           // payload: { task_id }

export function enqueueJob(db: Database, kind: JobKind, payload: unknown, opts?: { dedupKey?: string }): void
export function runOneBatch(db: Database, opts: { batchSize: number; loadAverageMax: number }): Promise<{ ran: number; skipped: 'idle' | 'none' }>
export function startScheduler(opts: {
  intervalMs: number; batchSize: number; loadAverageMax: number;
  getDb: () => Database
}): { stop: () => void }
```

**`lib/jobs/config.ts`** — single source for tunables:

```ts
export const JOB_CONFIG = {
  intervalMs:     Number(process.env.JOB_INTERVAL_MS ?? 15_000),  // 15s default
  batchSize:      Number(process.env.JOB_BATCH_SIZE ?? 4),
  loadAverageMax: Number(process.env.JOB_LOAD_MAX ?? Math.max(1, os.cpus().length * 0.8)),
}
```

Behavior:
- `enqueueJob` inserts a row with `state='pending'`, `scheduled_at = now`, `dedup_key = opts.dedupKey ?? null`. If `dedupKey` is provided, first runs `SELECT 1 FROM pending_jobs WHERE dedup_key = ? AND state = 'pending' LIMIT 1` (uses the partial index from §0); if a row exists, the enqueue is a no-op. The deterministic `dedupKey` (e.g. `embed:proj-1:doc:specs/foo.md`) is owned by the caller — see Migration 65 note.
- `startScheduler` returns a handle whose `interval` (default 15000ms) wakes the runner. On each tick:
  1. Read `os.loadavg()[0]`. If above `loadAverageMax`, skip this tick. Return `{ ran: 0, skipped: 'idle' }`.
  2. Else, claim up to `batchSize` (default 4) `pending` rows ordered by `scheduled_at ASC`, mark them `running`, dispatch each to its kind-handler in parallel.
  3. On success, mark `done` with `finished_at`. On error, increment `attempts`; if `attempts >= 3`, mark `failed` with `last_error`; else mark `pending` again and back off via `scheduled_at = now + 60s * 2^attempts`.
- Handlers live in `lib/jobs/handlers/<kind>.ts`. Each handler is a `(db, payload) => Promise<void>`. The runner doesn't know about the LLM or the embedding service — it just dispatches.

**Where the scheduler starts:** in the existing custom `server.ts`. Module-level singleton flag prevents double-registration if the file is re-imported during dev hot-reload:

```ts
// In server.ts, after existing init code:
if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test' && !globalThis.__schedulerStarted) {
  globalThis.__schedulerStarted = true
  const sch = startScheduler(JOB_CONFIG)
  for (const sig of ['SIGTERM', 'SIGINT', 'beforeExit']) {
    process.once(sig, () => sch.stop())
  }
}
```

The scheduler also exposes `stop()` for tests that need to spin it up explicitly.

**Test gating:** Vitest sets `process.env.VITEST = 'true'`. The scheduler does NOT auto-start under tests. Tests that exercise the runner instantiate `startScheduler` directly inside the test.

**Why not a separate worker:** complexity. SQLite is single-writer; another process means another connection and locking concerns. In-process keeps the contract simple. If load becomes a real issue we can extract later.

**Failure isolation:** every handler is wrapped in try/catch. A failing handler doesn't block the runner; failed jobs are retried with backoff up to 3× then parked. The runner logs errors via `console.warn`.

**Concurrency limits:** `batchSize: 4` caps at 4 LLM calls in flight. llama.cpp typically handles a small batch fine; tune via env if needed.

### 3. Session grader

Triggered when a session ends with `summary != null` AND `task_id != null` (sessions tied to a task — those drive the router's success-rate). Sessions without a task are out of scope (no router decision to update).

**Trigger:** in `lib/session-manager.ts`, immediately after the `captureSessionSummary` call (which is between `endSession` and `flushSessionEvents` per the prior slice), enqueue:

```ts
if (opts.taskId) {
  enqueueJob(db, 'grade_session', { session_id: sessionId }, { dedupKey: `grade_session:${sessionId}` })
}
```

**Handler:** `lib/jobs/handlers/grade_session.ts`. Reads the session row, fetches its task (`getTask`). Builds a prompt that does NOT mention which provider was used (avoids systematic bias toward the local model's preferred prose style):

```
Task: {task.title}
Goal: {task.idea_file ?? '(no description)'}
Phase: {session.phase}

Agent's final summary:
{session.summary}

---

Question: Did the agent achieve the task's goal in this session?
Respond with EXACTLY one JSON object, no preamble:
{ "grade": "yes" | "partial" | "no", "reason": "<one sentence>" }
```

LLM call via `localComplete`, max 200 tokens, 30s timeout (cold-start safe on quantized models). Parse JSON; on success, write `grade` + `grade_reason` + `graded_at` to the session row.

**Feeding the router** (this is the part the prior spec got wrong). The existing API is `recordOutcome(db, { decisionId, outcome })` at `lib/router/recordOutcome.ts:21`, where `Outcome = 'success' | 'failure' | 'transient_error'`. Two changes are needed:

1. **Extend the `Outcome` enum** in `lib/router/types.ts:8` to add `'partial'`:
   ```ts
   export type Outcome = 'success' | 'failure' | 'partial' | 'transient_error'
   ```
2. **Update the success-rate math** in `recordOutcome.ts`. Today: `(sumPrev + (isSuccess ? 1 : 0)) / newN`. New:
   ```ts
   const score = outcome === 'success' ? 1 : outcome === 'partial' ? 0.5 : 0
   const newRate = (sumPrev + score) / newN
   ```
   The early-return `if (outcome === 'transient_error') return` stays as-is — transient errors still don't update the score.

3. **Look up the decision row by session.** Sessions don't carry `decision_id`; the link is `routing_decisions.session_id`. The handler runs:
   ```ts
   const decision = db.prepare(
     'SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1'
   ).get(sessionId) as { id: string } | undefined
   if (!decision) return  // session wasn't routed (e.g. fixed-provider task) — grade is still useful for UI but no router update
   recordOutcome(db, { decisionId: decision.id, outcome: gradeToOutcome(grade) })
   ```
   where `gradeToOutcome('yes') = 'success'`, `gradeToOutcome('partial') = 'partial'`, `gradeToOutcome('no') = 'failure'`.

These three changes are mechanical; the router's existing tests should continue to pass because the `'partial'` branch is additive.

**Failure modes:**
- LLM timeout / malformed JSON → handler throws → job retried, then parked. Session's grade stays NULL. Router's stats unaffected.
- Provider config missing → handler exits early with a `console.warn`; job marked `done` to prevent retry storm.
- Session's `routing_decisions` row missing (legacy/manual session) → grade is still written; router update skipped silently.

### 4. Next-actions extractor

Triggered alongside the grader. Same trigger condition (session ended with `summary != null`), but this one fires for ALL sessions regardless of `task_id` — the structured next_actions are useful even for doc-originated or standalone sessions.

**Trigger:** also in `lib/session-manager.ts`, after `captureSessionSummary`:

```ts
if (sessionRow.summary) {
  enqueueJob(db, 'extract_next_actions', { session_id: sessionId }, { dedupKey: `extract_next_actions:${sessionId}` })
}
```

**Handler:** `lib/jobs/handlers/extract_next_actions.ts`. Reads the summary, asks the LLM:

```
You are extracting structured next-steps from a coding agent's wrap-up message.
Return a JSON object with EXACTLY this shape, no preamble:

{
  "next_actions": ["short action sentence", ...],
  "open_questions": ["short question", ...],
  "files_touched": [{ "path": "<relative>", "change": "<one-line description>" }, ...]
}

Rules:
- Each next_action is one concrete step a developer or another agent could take. 0-5 entries.
- Each open_question is one ambiguity the agent flagged. 0-3 entries.
- files_touched lists files the agent modified or created with a one-line description. 0-20 entries.
- If a section has no entries, return an empty array.
- Use exact relative paths as the agent wrote them. Don't invent paths.

Agent's final summary:
{summary}
```

LLM call via `localComplete`, max 1000 tokens, 20s timeout. Parse JSON; on success, write to `sessions.next_actions` (stored as the JSON string with `extracted_at` and `model` added).

**Triggering downstream jobs:** if `next_actions.files_touched.length > 0`, enqueue one `refresh_prep` job per affected task (see §5 for the lookup logic).

### 5. Originator-aware prep refresh

Triggered as a downstream job from `extract_next_actions`. For each `files_touched[i].path`, look up matching tasks via a small helper:

**Helper:** `lib/prep/taskMatchesPath.ts`

```ts
export function taskMatchesPath(task: Task, path: string): boolean
```

Normalization rules (in order):
1. Strip `file://` prefix from `task.idea_file` if present (Migration 40 prefixes all native task `idea_file` values).
2. Normalize the input `path` and the stripped `idea_file`: trim whitespace, drop leading `./`, treat absolute paths as-is (don't resolve).
3. **Exact match wins:** if normalized `idea_file` === normalized `path`, return true.
4. **Fallback for tasks with no `idea_file`:** parse `task.prep_notes` JSON (if present), check if any entry in `files[]` has a `path` property equal to the normalized `path`. Return true if found.
5. Case-sensitive matching (matches the underlying filesystem on Linux/macOS where this app runs).
6. Return false otherwise.

This explicit rule eliminates the spec's earlier hand-waving. Substring matching is intentionally not used — too many false positives (e.g. `lib/auth.ts` would match `lib/authorize.ts`).

**Caller** in `lib/jobs/handlers/extract_next_actions.ts`:

```ts
for (const file of next_actions.files_touched ?? []) {
  const tasks = listTasks(db, { projectId }).filter(t => taskMatchesPath(t, file.path))
  for (const task of tasks) {
    enqueueJob(db, 'refresh_prep', { task_id: task.id }, { dedupKey: `refresh_prep:${task.id}` })
  }
}
```

**Handler:** `lib/jobs/handlers/refresh_prep.ts`. Calls the existing `prepareTask(db, taskId)` (from the task-prep slice, which already has its own concurrent-run guard via `RECENT_PREPPING_MS`). The handler is a one-line invoke; the prep slice's logic does the rest.

**No new throttling logic.** The prep slice already throttles concurrent runs internally; the runner's `batchSize: 4` provides additional natural pacing. With `dedupKey` per task and the 60s recency guard, refresh-prep loops can't accumulate faster than ~1/min per task.

### 6. Project-wide embedding index

**Embed job payload shape:**

```ts
type EmbedPayload = {
  project_id: string
  kind: 'doc' | 'spec' | 'plan' | 'session_summary' | 'task'
  ref: string          // for docs/specs/plans: relative path; for session_summary: session id; for task: task id
  content_hash: string // sha256 of the content the trigger saw — handler re-reads, recomputes, and skips if hash differs (file changed since enqueue)
}
```

Content is NOT carried in the payload — the handler re-reads from the source (filesystem for docs/specs/plans; `sessions.summary` column for session_summary; `task.title + '\n' + task.idea_file` for task). This keeps payloads small (~200 bytes) and makes the dedup_key (`embed:${project_id}:${kind}:${ref}`) cheap.

**Trigger points** (all enqueue `embed` jobs with `dedupKey`):

- **Doc / spec / plan tree fetch — fire-and-forget after response sent.** A new helper `lib/jobs/triggers/onDocsTreeRead.ts` is invoked from `app/api/projects/[id]/docs/route.ts`'s GET handler AFTER the response object is constructed (using `setImmediate` or `queueMicrotask` so the response isn't blocked). The helper walks the tree, computes `sha256(content)` per file, compares against existing `embeddings(content_hash, model)` for that ref, and enqueues `embed` for misses or stales. The comparison checks BOTH `content_hash` AND `model` — if the user's active embedding model differs from what was previously used, the row is treated as stale and re-embed is enqueued.
- **Session-end:** the `extract_next_actions` handler, on success, enqueues `embed` for the session's `summary` (`kind: 'session_summary'`, `ref: sessionId`).
- **Task create/update:** in `lib/db/tasks.ts`'s `createTask` / `updateTask` (or wrapper layer), enqueue `embed` with `kind: 'task'` after a write that changes `title` or `idea_file`. Same dedup pattern.
- **One-time startup sweep:** the scheduler enqueues a "scan all projects' docs" job during startup (gated by a sentinel row in `schema_migrations` per §0 — version `999_001`, name `'sweep_initial_embeddings'`). Skipped if the row exists. This warm-starts the index for first-time install.

**Handler:** `lib/jobs/handlers/embed.ts`. Reads content via a kind→content resolver (`lib/embeddings/loadContent.ts`), recomputes hash, compares with payload's `content_hash` — if mismatched, exits early (file changed; the next docs-tree-read trigger will enqueue with the new hash). On match, fetches the active local provider, calls `localEmbed(provider, [content], { timeoutMs: 30_000 })`, writes the result:

```ts
const hash = payload.content_hash
const buf = Buffer.from(embeddings[0].buffer, embeddings[0].byteOffset, embeddings[0].byteLength)
db.prepare(`
  INSERT INTO embeddings (project_id, kind, ref, content_hash, vector, dim, model, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(project_id, kind, ref) DO UPDATE SET
    content_hash = excluded.content_hash,
    vector = excluded.vector,
    dim = excluded.dim,
    model = excluded.model,
    updated_at = excluded.updated_at
`).run(project_id, kind, ref, hash, buf, dim, model, now)
```

**ENOENT handling:** if the file no longer exists at handler time (deleted between enqueue and run), the handler exits with a `console.warn` and marks the job `done`. Existing embedding row left in place; UI may show stale similarity hits. Acceptable — stale doc results are not catastrophic.

**Search:** `lib/embeddings/search.ts`:

```ts
export function findSimilar(db: Database, opts: {
  projectId: string
  queryVector: Float32Array
  queryDim: number              // must match stored dim
  queryModel: string            // must match stored model
  kinds?: ('doc' | 'spec' | 'plan' | 'session_summary' | 'task')[]
  limit?: number
  excludeRef?: string
}): Array<{ kind: string; ref: string; score: number }>
```

The query MUST pass both `queryDim` and `queryModel`. The SQL filter is `WHERE project_id = ? AND model = ? AND dim = ? AND kind IN (...)`. Rows from a previous embedding model are silently excluded — they get re-embedded by the docs-tree trigger on next render. Brute-force cosine similarity over the filtered subset; reads BLOBs into memory, decodes via `new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)` (zero-copy), computes dot products, sorts descending.

At project scale (low thousands of items max), this is sub-100ms. If we ever cross 10K items per project, add HNSW.

**Use cases shipped in this slice (UI surfaces — see §9):**
- "Similar past sessions" on the docs Sessions panel — given the selected doc's embedding, find session_summaries with high similarity.
- "Possibly duplicate" hint on the Tasks page — given a task's title+description embedding, flag other open tasks above a similarity threshold (e.g. 0.85 cosine).

Other use cases (router context, knowledge-graph traversal) are out of scope for this slice but use the same index.

### 7. Critic ensemble for specs and plans

**Trigger:** the same `lib/jobs/triggers/onDocsTreeRead.ts` helper (per §6) also enqueues critique jobs when a `spec/*.md` or `plan/*.md` file's `content_hash` doesn't match an existing `critic_findings.content_hash`. The path-pattern check is simple: any file under `docs/superpowers/specs/` enqueues `critique_spec`; any file under `docs/superpowers/plans/` enqueues `critique_plan`. Other markdown files are skipped. Fire-and-forget after the docs response is sent.

**Latency expectation:** at typical small-local-model speeds (e.g. Qwen 3.6 9B), a single critique pass on a ~10KB spec takes 20-40 seconds. Three passes ≈ 60-120s per critique. The runner's loadavg gate means critique often sits in queue while user-facing work proceeds; users may not see findings update for several minutes after a spec edit.

**Handler:** `lib/jobs/handlers/critique.ts`. Three sequential LLM passes against the same rubric, with a temperature wobble between runs:

```
You are reviewing a {spec|plan} document. Identify issues using this rubric:

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
{content}
```

Three runs at temperature 0.0, 0.2, 0.4. We collect issues from all three, dedupe by `(severity, category, message[:50])`, and KEEP only issues that appear in ≥2 runs (majority vote). This filters single-run hallucinations.

Persist the merged set in `critic_findings.findings` as JSON. Render results inline on the docs page (see §9d).

**Why three runs:** matches the established review pattern from prior slices (subagent-driven-development) where three independent passes catch what one misses. Cheap with a small local model — typically 5-15s per pass on a modest machine.

**Failure modes:**
- All three runs fail → handler throws → job retried then parked. Critic findings stay stale; UI shows last-known.
- Some runs fail → use the successful ones; if only one succeeded, store with `votes: 1` and render with reduced confidence indicator.

### 8. Provider config: enabling vs disabling automation

The whole reflective workflow depends on a working local provider. If no local provider is configured, all 6 features no-op gracefully:

- The scheduler still ticks but every handler exits early with `console.warn('reflective: no local provider configured')`.
- Triggers still enqueue jobs (no harm — they just sit pending).
- UI surfaces fall back: docs panel shows "no similar sessions yet" instead of an error; spec view shows no critic findings.

There's no on/off switch UI for these features in this slice (per the user's preference: "no config-matrix UIs"). The presence of a local provider IS the switch.

### 9. UI surfaces

#### 9a. Session drawer: "Next actions" section

After the existing terminal/banner block in `SessionDetailDrawer`, add a collapsible "Next" section when `session.next_actions` is set:

```
─────────────
Next                         (extracted by <model>, 3m ago)
─────────────
• <next action 1>
• <next action 2>
─────────────
Open questions
─────────────
• <open question 1>
─────────────
Files touched
─────────────
  lib/auth.ts — fixed redirect loop
  app/login/page.tsx — added remember-me checkbox
─────────────
```

No grade displayed in the drawer (grade is for the router, not for the user looking at a session).

#### 9b. Router insights page: grade-driven success bars

The existing `app/(dashboard)/insights/page.tsx` (or wherever the router insights live) gains a small column showing graded outcomes per provider:

```
provider     graded   success   partial   fail    success%   (of graded)
claude       127      98        12        17      82.7%
codex        43       28        9         6       77.9%
gemini       21       11        4         6       61.9%
```

Rows are computed from `routing_outcomes` JOIN `sessions.grade IS NOT NULL`. The denominator is graded decisions only — sessions without `task_id`, sessions still running, and sessions whose grading job is still pending are excluded. The existing total-decisions count remains visible in adjacent existing columns; this is a net-new column that doesn't alter existing totals.

#### 9c. Docs Sessions panel: "Similar past sessions"

In `DocSessionsPanel` (built last slice), below the existing per-doc sessions list, add a "Related sessions from other docs" section that uses the embedding index:

```ts
const docEmbedding = useEmbedding(projectId, 'doc', selectedDoc.relativePath)
const similar = useSimilar(projectId, docEmbedding, { kinds: ['session_summary'], limit: 5 })
```

Renders as a compact list of session cards (reusing the panel's existing card component). Empty when the index doesn't have the doc yet.

#### 9d. Spec/plan view: critic findings inline

When viewing a `spec/*.md` or `plan/*.md` in the docs page, render the latest `critic_findings` (matched by `content_hash`) as a collapsible section ABOVE the rendered markdown body:

```
⚠️ 2 critical · 5 important · 3 minor              [▼ expand]

CRITICAL
  · placeholder: "TODO: define the API shape" (line 47)
  · contradiction: section §3 says w[480px], §4a says w[600px]

IMPORTANT
  · ambiguity: "the helper handles both" — which helper?
  ...
```

When `content_hash` doesn't match (file was edited after critique), still render the previous findings with a small "Stale — re-running" badge inline next to the section header. Users see something useful while the new run completes (often a minute or more), instead of a blank stub. When the new findings land, the badge disappears on next render.

#### 9e. Tasks page: dedup hint

Per task row, an inconspicuous "↪ similar to: <other task title>" sublabel when the task's title+description embedding has cosine ≥ 0.85 against another open task's embedding. Click → navigates to the similar task. Pure suggestion, no merge UI.

### Data flow

```
Session ends (lib/session-manager.ts)
  → captureSessionSummary (existing)
  → enqueueJob('grade_session', { session_id })       (NEW; only if task_id)
  → enqueueJob('extract_next_actions', { session_id }) (NEW; only if summary)
  → flushSessionEvents (existing)

Scheduler tick (every 15s, in server.ts)
  → if loadavg < threshold:
    → claim up to N pending jobs
    → dispatch each handler in parallel
    → on success → done; on error → backoff/park

extract_next_actions handler
  → write sessions.next_actions
  → if files_touched.length > 0:
    → for each path, find tasks referencing it
    → enqueueJob('refresh_prep', { task_id })

embed handler
  → llama.cpp /v1/embeddings
  → upsert into embeddings table

critique_{spec,plan} handler
  → three local-LLM passes (temp 0.0/0.2/0.4)
  → majority-vote dedup
  → upsert into critic_findings

Docs page render
  → fetches docs tree (existing)
  → enqueues missing/stale embed + critique jobs
  → renders critic findings inline
  → renders similar sessions panel

Router insights page
  → JOIN sessions.grade onto routing_outcomes
  → renders graded success rates
```

### Failure modes (slice-wide)

| Scenario | Behavior |
|----------|----------|
| llama.cpp unreachable | Handler throws → backoff retry → parks at attempt 3 with `last_error`. Scheduler keeps ticking. |
| LLM returns malformed JSON | Handler throws → same path. |
| Local provider unconfigured | Each handler exits early with `console.warn`; jobs marked `done` (not retried indefinitely). |
| Doc deleted between embed-enqueue and embed-run | Handler reads file; ENOENT → marks job `done` (no error retry). Existing embedding row left in place; UI may show stale similarity hits. Acceptable: stale doc results are not catastrophic. |
| Spec/plan critic disagrees across runs (no majority) | Issue dropped; row stored with whichever issues did get majority. Worst case: empty `findings` for a healthy doc. |
| Job queue grows unbounded if scheduler is broken | `pending_jobs` is just a SQLite table. Operator can inspect via `sqlite3 data/db.sqlite 'SELECT state, count(*) FROM pending_jobs GROUP BY state'`. No dedicated diagnostics endpoint in this slice. |
| Embedding model changes (e.g. user upgrades) | `embeddings.model` mismatch is tolerated by `findSimilar` (filters to consistent model on read). On next render, the docs page enqueues re-embeds. Old rows linger until overwritten. |
| Two scheduler instances (e.g. `next dev` reload) | Both start a scheduler. SQLite single-writer serializes `claim job` updates so each job runs at most once. Wasted polling, no correctness risk. We accept it for dev reloads. |
| Refresh-prep loops (a session's prep generates files that another session touches) | Each `refresh_prep` enqueue uses `dedupKey: 'refresh_prep:<task_id>'`, AND `prepareTask` has its own concurrent-run guard (60s recency). Loops can't accumulate faster than ~1/min per task. |
| Critic finds a critical issue and we still ship | Findings are advisory. The user (or a future automation) decides whether to act. |

### Testing

This slice has substantially more surface than prior slices. Tests are organized by layer:

**Unit (vitest, in-memory DB):**
- `tests/jobs/runner.test.ts` — enqueue, dedup, claim/run/done, backoff, parked-after-3-attempts, loadavg gate, batch concurrency cap.
- `tests/jobs/handlers/grade_session.test.ts` — mocked `localComplete` returns valid JSON → grade persisted + `recordRoutingOutcome` called; malformed JSON → throws; missing provider → exits early.
- `tests/jobs/handlers/extract_next_actions.test.ts` — same shape, plus: `files_touched` triggers `refresh_prep` enqueue.
- `tests/jobs/handlers/embed.test.ts` — mocked `localEmbed` returns vector → upsert; same `(project, kind, ref)` updates rather than duplicates; ENOENT path skipped.
- `tests/jobs/handlers/critique.test.ts` — three mocked runs returning overlapping issues → majority vote filters single-run hallucinations.
- `tests/router/localEmbed.test.ts` — POST shape correct, response parsed, timeout aborts, error throws.
- `tests/embeddings/search.test.ts` — cosine similarity ranks correctly; kinds filter; excludeRef filter.

**Integration:**
- `tests/sessions/grade-and-next-actions-pipeline.test.ts` — start with a session row, simulate session-end, assert both jobs are enqueued, run the scheduler one tick with mocked LLM, assert `grade` + `next_actions` populated AND `refresh_prep` enqueued for matching tasks.

**Component (react-testing-library):**
- `components/sessions/__tests__/SessionDetailDrawer.test.tsx` — extend with a Next-actions render test (mock `session.next_actions`).
- `components/docs/__tests__/DocSessionsPanel.test.tsx` — new file. Renders similar-sessions section when `useSimilar` returns matches; empty state when not.
- `app/(dashboard)/projects/[projectId]/docs/__tests__/critic-findings.test.tsx` — renders findings section above markdown body when `critic_findings` row exists matching `content_hash`.

**Smoke (manual, doc only):**

Saved as `docs/superpowers/specs/2026-05-02-reflective-workflow-smoke.md`:

1. Confirm a local provider is configured. Restart server. Look for "scheduler started" log line.
2. Open the Docs page on a fresh project. Within ~30s of viewing, the embed jobs should drain and the similar-sessions panel should populate after the next session ends.
3. Run a session against a task. Within 30s of session-end:
   - Drawer's Next section appears with extracted actions.
   - Session row in the DB has `grade` set.
   - If summary mentioned files that other tasks reference, those tasks' prep_notes get refreshed.
4. Open the router insights page. Provider rows now show success / partial / fail counts.
5. Save a new spec file. Within 60s, the docs page shows critic findings above the rendered body.
6. Edit the same spec file. The findings show "out of date — re-running" briefly, then update.
7. Open the Tasks page. Tasks with similar titles show a "↪ similar to" hint.
8. Stop the server. Restart. Pending jobs resume from where they left off.
9. Misconfigure the provider URL. Verify handlers log warnings and don't crash the runner. Restore the URL — pending work drains.
10. Spam-create 50 tasks. Verify the scheduler doesn't peg the CPU; load-average gate kicks in.

### Migration & rollout notes

- 7 additive migrations (65–71) plus migration 72 (rebuild `routing_outcomes` to widen its CHECK constraint to include `'partial'`). All idempotent. Migration 72 was discovered during implementation — `routing_outcomes.outcome` was created by migration 53 with `CHECK (outcome IN ('success','failure','transient_error'))`, and SQLite has no `ALTER ... DROP CONSTRAINT`, so a CREATE-NEW / INSERT SELECT / DROP / RENAME rebuild is required for the `'partial'` outcome to be insertable.
- 1 new dependency-shaped concept: an embedding model loaded into the user's local stack. Documented in the smoke doc; if the user's llama.cpp doesn't have an embedding model, the embed handler errors and the affected UIs gracefully degrade.
- Background work (the scheduler) starts automatically with `server.ts`. No CLI changes.
- Existing tests must continue to pass; the scheduler does NOT auto-start in tests (gated by `process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'`).

### Out of scope (explicitly)

- Re-embedding every spec/plan/summary on every model change — only stales-on-content-change. Model-change re-embedding is opt-in via a future "rebuild index" CLI command.
- HNSW or any vector-DB integration. Brute force is fine at current scale.
- Synthetic-PM mode (the periodic "what should we build next" pass) — separate slice.
- Auto-decompose of complex tasks — separate slice.
- Knowledge-graph queries beyond the embedding index — separate slice.
- Live agent-intent inference during streaming — separate slice.
- Auto-acting on critic findings (e.g. blocking ship). Findings are advisory only.
- Auto-acting on dedup hints. UI suggests; user decides.
- Mobile UI for any of this. Desktop-only product.
- Worker-process extraction of the scheduler. In-process is fine until proven otherwise.
- Configurable concurrency UI. Env vars only (`JOB_BATCH_SIZE`, `JOB_LOAD_MAX`).

## Open Questions

None — design is locked. All architectural choices have explicit defaults; the user can override via env vars or provider config.

## Risk Acceptance

- **In-process scheduler in dev mode reload duplicates the scheduler.** Both instances poll; SQLite serializes claim updates so no double-execution. Dev-only oddity, accepted.
- **Embedding index reads all matching rows into memory for similarity.** At low-thousands per project, this is fine. If a project crosses ~10K embeddings, search slows to ~500ms-1s. Mitigation: introduce HNSW. For now, accepted.
- **Critic ensemble can produce empty findings on a doc with real issues.** Three votes is a coarse filter; rare critical issues that only show up in one run are dropped. Tradeoff: less false-positive noise, occasional false negatives. Accepted given the human-review pattern is still in place.
- **Grader fairness across providers.** The local LLM doing the grading might systematically rate one provider higher because the local model "agrees" with that provider's prose style. Mitigation: the prompt is provider-agnostic (we don't tell the grader which provider was used). Accepted as-is; can revisit by inspecting graded outcomes.
- **`llama.cpp` server contention.** The same server instance is used for embeddings AND completions AND critic ensembles. Heavy concurrent use can starve user-facing prep / smart-router calls. Mitigation: `JOB_BATCH_SIZE` env var; user can drop to 1 or 2 if they notice.
- **One-time startup index sweep blocks the scheduler.** First-run scan can enqueue thousands of `embed` jobs. Drained at `batchSize` per tick → background-only, doesn't block UI. Accepted; first-run completion takes minutes, not seconds.
- **No critic for already-merged specs/plans.** Findings only render in the docs view, not in commit-time hooks. Out of scope; future ship can add a "review my docs" CLI.
