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

1. **Auto on import** — in `lib/taskSources/syncService.ts`, after a `createTask` + `updateTask` pair lands a new row (the existing pattern uses two writes), call `void prepareTask(db, task.id)`. Fire-and-forget; never blocks the sync.
2. **Auto on update** — same sync code path. Before calling `updateTask` on an existing row, compare the incoming `(ext.title, ext.description)` against the current row's `(title, idea_file)` (the syncService stores the source description in `idea_file`). If either differs, call `void prepareTask(db, existing.id)` after the update. Plain string comparison — no hashing layer.
3. **Manual** — `POST /api/tasks/:id/prepare` returns 202 immediately and dispatches `void prepareTask(db, taskId)`.

`prepareTask` is internally guarded against concurrent runs on the same task: it skips if the row's `prep_status` is already `'prepping'` and `prepped_at` (or a separate `prep_started_at` we can add if needed) is within the last 60s. Older `'prepping'` is treated as crashed and overridden.

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

### Prompts (sketched in `lib/prep/prompts.ts`)

```
KEYWORD_PROMPT = `
You are extracting search terms from a software ticket. Reply with a JSON array of up to 10 strings — function names, file fragments, error messages, entity nouns. Lowercase, no punctuation, no duplicates. Reply ONLY with the JSON array.

Title: {title}
Description: {description}

JSON:
`

PREP_PROMPT = `
You are preparing a customer ticket for a developer. Read the title and description and reply with a JSON object with exactly these keys:
{
  "summary": <1-2 sentence plain-English summary of what the customer wants>,
  "intent": <implicit goal or watch-fors the dev should know>,
  "open_questions": [<ambiguity 1>, <ambiguity 2>, ...]
}
Reply ONLY with the JSON object, no preface, no code fence.

Title: {title}
Description: {description}

JSON:
`

RERANK_PROMPT = `
You are picking the most relevant files for a software ticket. Given the candidate file paths and previews below, reply with a JSON array of up to 5 entries:
[
  { "path": <exact path from candidates>, "why": <one-line rationale> },
  ...
]
Reply ONLY with the JSON array.

Ticket:
{title}
{description}

Candidates:
{candidates}

JSON:
`
```

Final `files` is the union of `findRelevantFiles` (rerank output) merged into the prep packet. The `summary`, `intent`, and `open_questions` come from PREP_PROMPT.

### `PrepNotes` shape (stored as JSON in `tasks.prep_notes`)

```ts
type PrepNotes = {
  summary: string                                          // 1-2 sentences: what the customer wants
  intent: string                                           // implicit goal, watch-fors
  files: Array<{ path: string; why: string }>             // top-N relevant files with one-line rationale
  open_questions: string[]                                // ambiguities the dev should resolve before starting
  generated_at: string                                    // ISO timestamp
  model: string                                           // e.g. 'qwen-3.6:9b'
}
```

Re-prep eligibility is detected at the trigger sites by direct field comparison (sync hook compares `title` + `idea_file` against the current row before update). No content hash stored on the task; the cost of comparing two strings per task per sync iteration is negligible.

`renderPrepAsMarkdown(notes: PrepNotes): string` is exported from `lib/prep/types.ts` (or a small `lib/prep/render.ts`) and produces the markdown body used both by the session-context injection and the `task_comments` insert below.

## Data model

Three new columns on `tasks`, added via existing `runMigration` pattern. **Migration numbering**: pick the next free numbers at implementation time. If the smart-provider-router branch (slice A, migrations 51-60) is merged first, these become 61-63. If task-prep ships first or in parallel, allocate the next free trio (and document the reason for the gap if any). The router branch is committed but not yet merged, so coordinate at merge time.

```sql
-- Migration N
ALTER TABLE tasks ADD COLUMN prep_notes TEXT;            -- JSON-serialized PrepNotes; NULL until prepped

-- Migration N+1
ALTER TABLE tasks ADD COLUMN prep_status TEXT;           -- 'prepping' | 'ready' | 'failed' | NULL

-- Migration N+2
ALTER TABLE tasks ADD COLUMN prepped_at TEXT;            -- ISO timestamp of last successful prep attempt (NULL until first run)
```

`Task` TypeScript type extended in `lib/db/tasks.ts`:

```ts
prep_notes: string | null
prep_status: 'prepping' | 'ready' | 'failed' | null
prepped_at: string | null
```

`prepped_at` is updated at the END of every prep attempt (success or failure) — combined with `prep_status` it gives the concurrent-run guard the recency signal it needs.

A new helper `setTaskPrep(db, id, { status, notes?, prepped_at? })` writes the columns atomically (matches the `setTaskComplexity` pattern from the router slice).

## Comment-trail integration

The `task_comments` table is keyed by `(source, task_source_id, comment_id)` with a UNIQUE constraint — comments are normally synced from external sources, not authored locally. Prep-bot piggy-backs on this table by writing rows with `source = <task.source>` (so the comment threads under the original ticket) and a synthetic `comment_id = 'prep:<uuid>'` (uuid suffix so the UNIQUE constraint never collides on rapid re-runs).

Every successful `prepareTask` run inserts:

```ts
{
  id:             randomUUID(),
  project_id:     <task.project_id>,
  source:         <task.source>,                    // 'jira' | 'monday' | 'donedone' | 'github'
  task_source_id: <task.source_id>,                 // the original ticket id (so the inbox feed picks it up)
  comment_id:     `prep:${randomUUID()}`,           // synthetic + uuid so the UNIQUE(source, task_source_id, comment_id) constraint never collides on rapid re-runs
  author:         'prep-bot',                       // distinguishes from human comments
  body:           renderPrepAsMarkdown(notes),
  created_at:     now,
  synced_at:      now,
}
```

This single insert feeds two surfaces with zero extra plumbing:

1. **Task comment timeline** — the existing `(source, task_source_id)` thread already groups comments under the ticket; prep-bot rows interleave with human comments in chronological order.
2. **Inbox feed** (`/api/projects/[id]/inbox`) — already lists recent `task_comments` joined with the parent task title via `(source, task_source_id)`. The inbox page's badge logic uses `SOURCE_LABELS` / `SOURCE_COLORS` keyed by `comment.source` — but since prep-bot comments keep the original source, prep events would otherwise look like normal source comments. Override at render time: when `comment.author === 'prep-bot'`, show a 🔮 "Prepped" pill (e.g. `bg-violet-500/15 text-violet-400`) instead of the source pill, and render the body as markdown rather than plain text.

A failed prep does NOT write a comment (timeline stays uncluttered); it only flips `prep_status` and the failure is visible on the task detail page via the Prep panel.

Note: `task_comments` is keyed by the external `source`+`task_source_id`, not by `tasks.id`. Auto-trigger only fires for tasks that have both fields set (external tasks from sync). Manual prep is allowed on native (non-imported) tasks — in that path, `prepareTask` writes `prep_notes` + `prepped_at` + `prep_status` as usual but **skips the comment insert** when `task.source` or `task.source_id` is null. The native-task panel still renders fine; the inbox just doesn't see the event.

## API

New endpoints under `app/api/tasks/[id]/`:

- `POST /api/tasks/:id/prepare` — returns 202 immediately, dispatches `void prepareTask(db, id)`. Idempotent (the function guards against concurrent runs).
- `GET /api/tasks/:id/prep` — returns the current `{ status, notes, prepped_at }` for the task, with `prep_notes` parsed from JSON. 404 if task doesn't exist.

The existing `GET /api/projects/[id]/tasks` already returns full task rows; `prep_notes` and friends ride along automatically once the columns exist.

## UI

### Task detail surface — Prep panel

`components/tasks/ExternalTaskDetailDrawer.tsx` is the existing detail surface for tasks shown on the Tasks page. Note: the Tasks page lives-fetches `ExternalTask[]` directly from adapters (`GET /api/projects/[id]/external-tasks`), while prep state lives on the synced `tasks` table row.

Bridge: extend the external-tasks API response handler to query the `tasks` table once per request (`SELECT id, source, source_id, prep_notes, prep_status, prepped_at FROM tasks WHERE project_id = ? AND is_deleted = 0`), build a `Map<sourceKey, prepFields>` keyed on `${source}:${source_id}`, and merge prep fields onto each `ExternalTask` before returning. Live tasks that have no synced row yet (race window) get `prep_status = null`, which renders as "Not yet prepped." The `ExternalTask` type gains three optional fields:

```ts
type ExternalTask = {
  // ...existing fields
  prep_notes?: string | null         // JSON; consumer parses
  prep_status?: 'prepping' | 'ready' | 'failed' | null
  prepped_at?: string | null
}
```

The drawer reads those fields and renders the Prep panel.

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

### Inbox and comment trail (shared renderer change)

The render rule is the same in both surfaces: when `comment.author === 'prep-bot'`, swap the source pill for a 🔮 "Prepped" pill (e.g. `bg-violet-500/15 text-violet-400`) and render the body as markdown. The inbox page already lists comments via `/api/projects/[id]/inbox` (covered above in **Comment-trail integration**). The task-level comment timeline (wherever `task_comments` are rendered for a single task) gets the same one-line `if author === 'prep-bot'` switch.

Audit step at implementation time: grep the codebase for places that render `task_comments` rows and confirm both the inbox page and any per-task timeline get the override. Each new render site is a one-liner.

## Failure handling

- Local model unreachable → `prep_status='failed'`, `prep_notes` left NULL, task fully usable, no comment-trail entry.
- ripgrep returns nothing → `files: []` is fine; the prep packet still has summary + intent + open_questions and `prep_status='ready'`.
- LLM returns garbage JSON for the main prep call → strict parse with a fallback prompt re-try once; if that also fails, `prep_status='failed'` (don't write half-baked notes).
- Concurrent `prepareTask` calls on the same task → guard via `prep_status='prepping'` + recency check; the late call short-circuits silently.
- All failures are silent at the session-spawn path — the session works as it does today, just without prep injection.

## Testing strategy

- **Unit**: `findRelevantFiles` tested with a fixture project tree and a mocked `localComplete`. Covers: keyword extraction, ripgrep dispatch, top-N selection, no-hits, garbage LLM output.
- **Unit**: `prepareTask` tested with a mocked `localComplete` and `findRelevantFiles`. Covers: happy path writes `prep_notes` + status 'ready' + comment row + `prepped_at`; LLM error → status 'failed' + no comment + `prepped_at` still updated; concurrent-run guard short-circuits when `prep_status='prepping'` and `prepped_at` is recent.
- **Integration**: syncService re-runs prep when `title` or `idea_file` changes (not when `priority`, `labels`, etc. change). Direct field comparison.
- **Integration**: `spawnSession` with a prepped task injects prep into `userContext`. `spawnSession` without `taskId` doesn't. Respawn doesn't double-inject.
- **API**: `POST /api/tasks/:id/prepare` returns 202 and triggers prep. `GET /api/tasks/:id/prep` returns parsed JSON or 404.
- **Smoke**: end-to-end via the real API + real local model (skipped in CI; documented for manual run).

## Migration / implementation plan

(Order matters; each step is independently mergeable except where noted.)

1. **Schema**: three `runMigration` calls (allocate the next free numbers — see Data model). Update `Task` TypeScript type with the three new fields. Add `setTaskPrep(db, id, ...)` helper to `lib/db/tasks.ts`.
2. **`lib/prep/` module skeleton**: `types.ts` (`PrepNotes`, `PrepStatus`), `prompts.ts` (keyword + main prep prompts), `index.ts` (re-exports), `render.ts` (`renderPrepAsMarkdown`).
3. **`findRelevantFiles`** in `lib/prep/findFiles.ts` + unit tests with fixture project tree and mocked `localComplete`.
4. **`prepareTask`** in `lib/prep/prepareTask.ts` + tests covering happy path, LLM error, concurrent-run guard.
5. **Sync hook** in `lib/taskSources/syncService.ts`: dispatch `void prepareTask(db, task.id)` after `createTask` for new rows, and after `updateTask` for existing rows when `(title, idea_file)` changed. Direct field comparison.
6. **API**: `POST /api/tasks/:id/prepare` + `GET /api/tasks/:id/prep` + tests.
7. **`spawnSession` injection**: `prepUserContext` helper called inside `spawnSession` before adapter spawn; `<!-- prep:auto -->` marker prevents respawn double-include. Test with prepped task / unprepped task / respawn.
8. **External-tasks API enrichment**: extend `GET /api/projects/[id]/external-tasks` to merge `prep_notes`/`prep_status`/`prepped_at` from the `tasks` table onto each `ExternalTask`. Extend the `ExternalTask` type with the optional fields.
9. **Task detail Prep panel** in `ExternalTaskDetailDrawer.tsx`. **Start-session checkbox** wiring.
10. **Comment renderer override**: shared `if author === 'prep-bot'` switch — apply at the inbox page and any task-level comment-timeline render site (audit via grep at this step).
11. **End-to-end smoke** + ship.

Estimated 11 tasks, similar shape to the router slice. Reuses the local-model wiring from the router.

## Out-of-scope follow-ups

- **Embedding-based file search** (router slice D — local-model utility layer).
- **Cross-project pattern matching** ("similar to project X's ticket #Y") — needs slice D embeddings.
- **Auto-classify priority** from prep — could feed `tasks.priority` from the LLM's read.
- **Prep for native (non-imported) tasks** — extend the trigger from "on sync" to "on task creation regardless of source".
- **Per-project prep prompt customization** — projects with very specific lingo could benefit from a prompt template override stored on the project.
