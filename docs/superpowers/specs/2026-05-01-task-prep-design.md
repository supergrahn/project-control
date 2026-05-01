# Task Prep Design

When an external task lands (Jira / Monday / DoneDone) or its source ticket changes, a local Ollama call reads it, finds likely-relevant files in the project, and writes a structured prep packet onto the task. Sessions started from that task automatically include the prep in `userContext`, so cloud providers (Claude / Codex / Gemini) start with full context instead of cold.

This is a follow-on to the Smart Provider Router (slice A). The local model (already wired via `lib/router/localComplete.ts` and used by the complexity classifier) is repurposed for a second always-on duty: turning customer-language tickets into developer-ready context.

## Goals

- Eliminate the manual "read the ticket, grep around, paste context into the prompt" warm-up that today every external task requires before a session is useful.
- Surface the prep up-front so the user can sanity-check before kicking off an Opus run with bad assumptions.
- Make the local model earn its keep continuously: every imported ticket becomes its work item, so the cloud agents arrive prepared.

## Non-goals (v1)

- Embedding-based file search. v1 uses ripgrep + LLM-extracted keywords; embeddings are reserved for the local-model utility layer (router slice D).
- Cross-project pattern matching ("this looks like ticket #X you finished last month") — interesting follow-up, out of scope here.
- Prep for native (non-imported) tasks. Only tasks with `source IN ('jira','monday','donedone','github')` get prepped automatically. A native task can still be manually re-prepped if the user wants.
- Multi-language file-finding heuristics tuned per project — generic ripgrep config is fine for v1.
- Suggesting a specific provider. The router already picks. Prep adds context; routing stays separate.

## Background

`lib/taskSources/syncService.ts` polls each configured external source on a cadence and writes/updates rows in the `tasks` table with `source`, `source_id`, `source_url`, and a `source_meta` JSON blob carrying the raw payload. Today new tickets land cold — no derived context, no file hints, no summary. A developer (or Claude session) starts by re-reading the ticket and grepping around.

`lib/router/localComplete.ts` already exposes a one-shot OpenAI-compatible HTTP call to a local model (Ollama or llama.cpp), with timeout and config-driven baseUrl/model. The complexity classifier (`lib/router/classify.ts`) uses it. Adding prep is a second consumer of the same helper.

`lib/search.ts` exists but indexes only `.md` files in the ideas/specs/plans/memory directories — useful for spec/idea search, useless for finding *code* relevant to a ticket. Prep needs a different file-finding path.

The `tasks` table already has `notes TEXT` (human/sync-edited content). Prep output is a distinct concern with a different write authority and lifecycle, so it gets its own column rather than appending into `notes`.

## Architecture

### New module `lib/prep/`

```
lib/prep/
  prepareTask.ts    main entrypoint: read task → call local LLM → run ripgrep → write back
  findFiles.ts      keyword extraction + ripgrep wrapper + LLM re-rank
  prompts.ts        prep prompt template + keyword-extraction prompt
  types.ts          PrepNotes shape + status enum
  index.ts          re-exports
```

Public surface:
- `prepareTask(db, taskId)` — async, idempotent. Sets `prep_status='prepping'`, runs the prep pipeline, writes `prep_notes` JSON + `prep_status='ready'` (or `'failed'`) on completion.
- `findRelevantFiles(projectPath, keywords, opts)` — pure-ish wrapper around ripgrep; returns ranked matches.

The module reuses `localComplete` from `lib/router`. No new dependency surface.

### Triggers

Three call sites all dispatch the same async `prepareTask(db, taskId)`:

1. **Auto on import** — in `lib/taskSources/syncService.ts`, after a new task row is inserted, call `void prepareTask(db, newTaskId)`. Fire-and-forget; never blocks the sync.
2. **Auto on update** — in the same sync code, when an existing task's `source_meta.title` or the parsed description text differs from the currently stored snapshot, call `void prepareTask(db, taskId)` to re-prep. Snapshot comparison uses a small hash to avoid string churn.
3. **Manual** — `POST /api/tasks/:id/prepare` returns 202 immediately and dispatches `void prepareTask(db, taskId)`.

`prepareTask` is internally guarded against concurrent runs on the same task: it skips if the row's `prep_status` is already `'prepping'` and the timestamp is recent (<60s). Older `'prepping'` is treated as crashed and overridden.

### Session integration

`lib/session-manager.ts spawnSession()` already accepts `taskId`. Add a small helper:

```ts
function prepUserContext(db: Database, taskId: string | undefined, originalContext: string): string {
  if (!taskId) return originalContext
  const task = getTask(db, taskId)
  if (!task?.prep_notes) return originalContext
  if (originalContext.includes('<!-- prep:auto -->')) return originalContext  // already injected
  const rendered = renderPrepAsMarkdown(JSON.parse(task.prep_notes))
  return `<!-- prep:auto -->\n${rendered}\n\n---\n\n${originalContext}`
}
```

The HTML comment marker prevents double-include on respawn (Task 14 of the router slice persisted `user_context` on the session row, so the marker survives the round-trip). Called inside `spawnSession` right before the adapter spawn step.

### File-finding strategy (v1)

`findRelevantFiles(projectPath, task)` runs three steps:

1. **Keyword extraction**: local LLM gets `title + description`, returns up to 10 candidate identifiers (function names, table names, entity nouns, error strings). Constrained output via the keyword prompt.
2. **ripgrep sweep**: `rg --files-with-matches --no-heading --no-line-number --hidden --glob '!{node_modules,.next,dist,build,.git}/**' -i <kw1> <kw2> ...` (alternation pattern). Top 20 file paths by match count. Multi-keyword matches score higher.
3. **LLM re-rank**: feed the top 20 paths plus a 200-char preview of each (read with a hard byte cap) back to the local LLM, ask it to pick the best 5 with one-line "why this file" rationale.

If step 1 yields no keywords (model failed or returned junk), `findRelevantFiles` returns `[]` — the prep packet still gets a summary + open_questions, just no files.

If ripgrep returns no hits, `files: []` is the expected output.

If step 3 fails to parse, fall back to step 2's top 5 with empty `why` strings.

### `PrepNotes` shape (stored as JSON in `tasks.prep_notes`)

```ts
type PrepNotes = {
  summary: string                                          // 1-2 sentences: what the customer wants
  intent: string                                           // implicit goal, watch-fors
  files: Array<{ path: string; why: string }>             // top-N relevant files with one-line rationale
  open_questions: string[]                                // ambiguities the dev should resolve before starting
  generated_at: string                                    // ISO timestamp
  model: string                                           // e.g. 'qwen-3.6:9b'
  source_hash: string                                     // hash of (title + description) used to detect re-prep need
}
```

The `source_hash` lets the syncService cheaply detect whether a re-prep is needed: compute the hash on the current source, compare to `prep_notes.source_hash`, only re-prep on mismatch.

## Data model

Three new columns on `tasks`, added via existing `runMigration` pattern:

```sql
-- Migration 61
ALTER TABLE tasks ADD COLUMN prep_notes TEXT;            -- JSON-serialized PrepNotes; NULL until prepped

-- Migration 62
ALTER TABLE tasks ADD COLUMN prep_status TEXT;           -- 'pending' | 'prepping' | 'ready' | 'failed' | NULL

-- Migration 63
ALTER TABLE tasks ADD COLUMN prepped_at TEXT;            -- ISO timestamp of last successful prep (NULL until first success)
```

`Task` TypeScript type extended in `lib/db/tasks.ts`:

```ts
prep_notes: string | null
prep_status: 'pending' | 'prepping' | 'ready' | 'failed' | null
prepped_at: string | null
```

A new helper `setTaskPrep(db, id, { status, notes?, prepped_at? })` writes the columns atomically (matches the `setTaskComplexity` pattern from the router slice).

## Comment-trail integration

The `task_comments` table already exists and powers the inbox feed. Every successful `prepareTask` run inserts one new row:

```ts
{
  id: randomUUID(),
  task_id,
  author: 'prep-bot',
  body: <markdown rendering of summary + intent + files (just paths) + open_questions>,
  created_at: now,
}
```

This single insert feeds two surfaces with zero extra plumbing:

1. The task's comment timeline shows the prep history (timestamped entries every time prep ran).
2. The inbox feed (`/api/projects/[id]/inbox`) already lists recent `task_comments` from external-task threads — adding `'prep-bot'` to the recognized authors makes prep events appear with a 🔮 badge and "Prepped" label.

A failed prep does NOT write a comment (we don't want the timeline cluttered with "prep failed" noise); it only flips `prep_status` and the failure is visible on the task detail page.

## API

New endpoints under `app/api/tasks/[id]/`:

- `POST /api/tasks/:id/prepare` — returns 202 immediately, dispatches `void prepareTask(db, id)`. Idempotent (the function guards against concurrent runs).
- `GET /api/tasks/:id/prep` — returns the current `{ status, notes, prepped_at }` for the task, with `prep_notes` parsed from JSON. 404 if task doesn't exist.

The existing `GET /api/projects/[id]/tasks` already returns full task rows; `prep_notes` and friends ride along automatically once the columns exist.

## UI

### Task detail surface — Prep panel

`components/tasks/ExternalTaskDetailDrawer.tsx` is the existing detail surface for tasks shown on the Tasks page. Note: the Tasks page lives-fetches `ExternalTask[]` directly from adapters (`GET /api/projects/[id]/external-tasks`), while prep state lives on the synced `tasks` table row. Bridge: extend the external-tasks API response to JOIN each `ExternalTask` with its corresponding `tasks` row via `(source, source_id)` and include `prep_notes`, `prep_status`, `prepped_at` on the response. The drawer already receives the `ExternalTask`; it gains a Prep panel rendered from those new fields.

Panel content:
- **Header**: "🔮 Prep" with status pill (`Ready` / `Prepping…` / `Failed` / `Not yet prepped`).
- **Body** (when `prep_status === 'ready'`):
  - Summary block (1-2 sentences).
  - Intent block (multi-line).
  - Files list — paths rendered in monospace; click-to-copy. Future enhancement: open via the existing `/docs` viewer when the file is markdown, or via a generic file viewer for source files. Out of scope for v1.
  - Open questions — bulleted list.
  - Footer: `Prepped <time> ago by <model>` + `Re-prep` button.
- **Body** (when `'prepping'`): spinner + "Working — this usually takes 5-15 seconds."
- **Body** (when `'failed'`): error message + `Retry` button.
- **Body** (when `null`): "Not yet prepped." + `Prepare now` button.

For native (non-imported) tasks (which today render in `components/tasks/TaskDetailView.tsx`), the same panel can be reused as a follow-up — out of scope for v1, which only auto-preps imported tasks.

### Start-session integration

The "Start session" affordance (already on the task page) gets a checkbox: `[x] Include prep in context` (default checked when prep is ready). Click → opens the existing session-start modal with `userContext` pre-populated from prep.

### Inbox

No UI change required — the existing inbox surface picks up `task_comments` from `'prep-bot'` automatically. Optionally extend `SOURCE_LABELS` / `SOURCE_COLORS` in the inbox page to give prep events a 🔮 badge with their own color (e.g. `bg-violet-500/15 text-violet-400`).

### Comment trail

The existing comment-trail rendering (wherever `task_comments` are shown today) needs to recognize `'prep-bot'` and render its body as markdown (the human comments are typically plain text). One small `if author === 'prep-bot'` switch in the comment renderer.

## Failure handling

- Local model unreachable → `prep_status='failed'`, `prep_notes` left NULL, task fully usable, no comment-trail entry.
- ripgrep returns nothing → `files: []` is fine; the prep packet still has summary + intent + open_questions and `prep_status='ready'`.
- LLM returns garbage JSON for the main prep call → strict parse with a fallback prompt re-try once; if that also fails, `prep_status='failed'` (don't write half-baked notes).
- Concurrent `prepareTask` calls on the same task → guard via `prep_status='prepping'` + recency check; the late call short-circuits silently.
- All failures are silent at the session-spawn path — the session works as it does today, just without prep injection.

## Testing strategy

- **Unit**: `findRelevantFiles` tested with a fixture project tree and a mocked `localComplete`. Covers: keyword extraction, ripgrep dispatch, top-N selection, no-hits, garbage LLM output.
- **Unit**: `prepareTask` tested with a mocked `localComplete` and `findRelevantFiles`. Covers: happy path writes `prep_notes` + status 'ready' + comment row; LLM error → status 'failed' + no comment; concurrent-run guard; source_hash dedupes re-runs.
- **Integration**: syncService re-runs prep when title/description changes (not when other fields change). Hash-based comparison.
- **Integration**: `spawnSession` with a prepped task injects prep into `userContext`. `spawnSession` without `taskId` doesn't. Respawn doesn't double-inject.
- **API**: `POST /api/tasks/:id/prepare` returns 202 and triggers prep. `GET /api/tasks/:id/prep` returns parsed JSON or 404.
- **Smoke**: end-to-end via the real API + real local model (skipped in CI; documented for manual run).

## Migration plan

1. Schema: migrations 61-63 (three `runMigration` calls). Update `Task` type and `setTaskPrep` helper. Update `task_comments`-rendering code to handle `prep-bot` markdown body.
2. `lib/prep/` module skeleton + types + prompts.
3. `findRelevantFiles` + tests.
4. `prepareTask` + tests.
5. Sync hook in `lib/taskSources/syncService.ts` (auto-on-import + auto-on-update via source_hash).
6. `POST /api/tasks/:id/prepare` + `GET /api/tasks/:id/prep` + tests.
7. `spawnSession` injection + test.
8. Task detail Prep panel + Start-session checkbox.
9. Inbox surface tweaks (badge, color).
10. End-to-end smoke + ship.

Estimated 10-12 tasks, similar shape to the router slice. Reuses the local-model wiring from the router.

## Out-of-scope follow-ups

- **Embedding-based file search** (router slice D — local-model utility layer).
- **Cross-project pattern matching** ("similar to project X's ticket #Y") — needs slice D embeddings.
- **Auto-classify priority** from prep — could feed `tasks.priority` from the LLM's read.
- **Prep for native (non-imported) tasks** — extend the trigger from "on sync" to "on task creation regardless of source".
- **Per-project prep prompt customization** — projects with very specific lingo could benefit from a prompt template override stored on the project.
