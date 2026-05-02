# Session Summary + Originator Links — Design Spec

**Date:** 2026-05-02
**Branch:** `feature/session-summary`
**Status:** Draft

## Goal

At session-end, capture the agent's final summary message and persist it on the session row. Then surface bidirectional links between sessions and the artifacts that started them ("originators") — every session can be traced back to a doc / task / agent it was launched from, and every originator can list all sessions started from it with their captured summaries.

This applies to **all sessions** regardless of how they were launched (doc, task, agent, standalone).

## Non-Goals

- No second-pass LLM summarization. The summary is the agent's own final assistant message — captured as-is from `session_events`.
- No reflective re-analysis (e.g. "what did this session learn"). The captured text is whatever the agent said last; downstream features (insights extraction) already handle that separately.
- No UI for agent-originated sessions. Agents already get their own UI surface; adding a "Past Sessions" panel there is out of scope for this slice.
- No backfill for sessions ended before this migration ships. New column starts NULL for historical rows.

## Architecture

### 0. Schema and Type Changes (foundational)

This slice depends on three schema/type extensions that must land before the rest of the work compiles. Listed up-front so they aren't scattered through later sections:

#### Migration 64: `summary` column on sessions

```sql
ALTER TABLE sessions ADD COLUMN summary TEXT
```

Nullable, no default, no backfill. Idempotent via `runMigration(db, 64, 'sessions_summary', SQL, true)`.

#### Path format for `source_file`: keep absolute, convert at boundaries

Today, `app/api/sessions/route.ts:82` calls `resolveProjectPath` and stores `source_file` as **absolute**. The Docs page passes a project-relative path when listing sessions for a doc. Three call sites assume absolute (`spawnSession`, `respawnSessionWithProvider`, `getActiveSessionForFile`); changing the storage format would ripple into all of them.

**We keep the DB storing absolute paths**, no migration, no session-manager changes. The relative↔absolute conversion happens at two API boundaries:

1. **Originator helper (server→client):** `getSessionOriginator` receives `projectPath` in its lookups, strips it from `source_file` to produce a relative form for the doc-link `href` (`/projects/<id>/docs?file=<relative>`).
2. **Docs sessions API (client→server):** `GET /api/projects/[id]/docs/sessions?file=<relative>` reads the project's `path` from the DB, computes `absolute = projectPath + '/' + relative`, and runs `WHERE source_file = ?` with the absolute form.

This keeps the storage stable, contains the format mismatch to two well-defined boundaries, and avoids touching `spawnSession` / respawn / concurrent-session detection.

#### Type extensions

The current `Session` type omits fields that exist in the row schema. The originator helper, the docs panel, and the drawer all need them. Update both:

- **Server `Session` type** (`lib/db.ts:31-45`): add `task_id: string | null`, `agent_id: string | null`, `summary: string | null`. The columns already exist in the table (task_id since migration 20, agent_id since migration 25, summary as of migration 64); `getAllSessions` does `SELECT *` so all fields are already returned — only the type literal is missing them.
- **Client `Session` type** (`hooks/useSessions.ts:3-13`): add the same three fields, optional (`?: string | null`) so legacy callers that construct mock `Session` objects in tests still type-check without a sweep.

The fields ARE optional in the type but the client API endpoint always returns them. The mockability of the type is the only reason for `?:`.

This change ripples to every file that imports `Session` (≥8 callsites). Acceptance: optional additions don't break existing usage; tests that pass `Session` objects continue to compile.

### 1. Capture (server-side)

#### Capture point

The session-end handler at `lib/session-manager.ts:454-486` runs once per session when the child process exits. The relevant section (in order today):

```ts
getDb().prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run(exitReason, sessionId)
endSession(getDb(), sessionId)
// ... agent / task artifact updates ...
flushSessionEvents(getDb(), sessionId, logPath)  // ← deletes events from session_events table
```

Insert the summary capture **between `endSession` and `flushSessionEvents`** (events must still be in the DB to query):

```ts
const lastAssistant = db.prepare(`
  SELECT content FROM session_events
  WHERE session_id = ?
    AND role = 'assistant'
    AND content IS NOT NULL
    AND TRIM(content, X'20090A0D') != ''
  ORDER BY id DESC LIMIT 1
`).get(sessionId) as { content: string } | undefined
if (lastAssistant?.content) {
  db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(lastAssistant.content, sessionId)
}
```

The `TRIM(content, X'20090A0D') != ''` predicate skips whitespace-only or single-newline content that adapters may emit at the tail of streamed output. The custom charset `X'20090A0D'` (space, tab, LF, CR) is required because SQLite's default `TRIM(x)` strips only ASCII space (0x20).

This is a **synchronous, single-query operation** — no LLM call, no async I/O, no failure path that affects the rest of the shutdown sequence. Wrap in a try/catch that logs and continues so that any DB hiccup never blocks the rest of session-end:

```ts
try {
  // ... query + update as above ...
} catch (err) {
  console.warn('failed to capture session summary for', sessionId, err)
}
```

#### Why "last assistant event with non-empty content"

`session_events` is populated by the Claude Code, Codex, and Gemini adapters — they normalize streamed output to `TranscriptEvent { type, role, content, metadata }` with `role: 'assistant'` for text turns. The agent's final wrap-up message is the last `role: 'assistant'` row before exit. This works across these three providers without provider-specific parsing.

**Known limitation: Ollama adapter doesn't capture summaries.** The Ollama adapter at `lib/sessions/adapters/ollama.ts:14` emits `{ type: 'raw', content: ... }` without a `role` field. Sessions launched through Ollama therefore never have a captured summary — `summary` stays NULL even on successful completion. UI shows "No final message captured." This is acceptable for v1 (Ollama is a fallback / dev-only provider in this app); a future iteration can teach the adapter to emit `role: 'assistant'` for text content.

Edge cases:
- **Killed before any output**: no assistant rows exist → `summary` stays NULL.
- **Erroring providers** that emit an error message in stderr only: still NULL.
- **Tool-only final turn** (assistant emits a tool_use without text): the `content` is empty/whitespace, so it's skipped by the `TRIM(content, X'20090A0D') != ''` filter — we walk back to the last non-empty assistant message. Acceptable: any meaningful summary is upstream of trailing tool calls.
- **Very long final messages**: stored as-is. SQLite has no practical limit; the assistant rarely emits more than a few KB. If a wrap-up grows very large (10–20KB markdown is realistic for a long Claude Code session), the docs/task panels truncate display to 3 lines via CSS `line-clamp` and an inline "Show more" toggle that expands the full text. Storage is not truncated.

#### Side effects on existing code

None. `flushSessionEvents` continues to delete and write to JSONL log unchanged. The new UPDATE happens before deletion. The `summary` column is unset on insert (defaults NULL) so all existing INSERTs continue working without modification.

### 2. Originator helper

A pure function for deriving "where did this session come from?":

**File:** `lib/sessions/originator.ts`

```ts
import type { Session } from '@/hooks/useSessions'
import type { Task } from '@/lib/db/tasks'

export type OriginatorLink = { label: string; href: string }

export type SessionOriginator =
  | { kind: 'task'; task: OriginatorLink; doc: OriginatorLink | null; taskId: string; sourceFile: string | null }
  | { kind: 'doc';  doc: OriginatorLink; sourceFile: string }
  | { kind: 'agent'; agent: OriginatorLink; agentId: string }
  | { kind: 'standalone' }

export function getSessionOriginator(
  session: Pick<Session, 'project_id' | 'source_file'> & {
    task_id?: string | null
    agent_id?: string | null
  },
  lookups: { tasks: Pick<Task, 'id' | 'title'>[]; projectPath?: string },
): SessionOriginator
```

The optional `projectPath` is used to compute the relative form of `source_file` for the doc-link href. When provided, the helper strips the project root prefix; when not provided (e.g. tests with no project lookup), it falls back to the value as-stored.

**Resolution order** (first match wins):

1. `task_id` set: kind is `'task'`. Returns BOTH the task link AND (if `source_file` is also set) the doc link. Spec/plan-phase sessions typically have both — the task IS the originator, and the doc is the spec/plan output the task was working on. The drawer renders "From <task> via <doc.md> ↗" with both clickable when `doc` is non-null. The task label uses `lookups.tasks.find(...).title` if found, falling back to `'Task ' + taskId.slice(0, 8)`. The doc sub-link uses the basename for label.
2. `source_file` set, no `task_id`: kind is `'doc'`. Pure-doc origin (e.g. running an action on a Docs-page file directly).
3. `agent_id` set, no `task_id`/`source_file`: kind is `'agent'`. Label is generic `'Agent'` since this slice doesn't include agent-name lookup.
4. None of the above: kind is `'standalone'`.

**Hrefs:**

- Task: `/projects/<projectId>/tasks/<taskId>`
- Doc: `/projects/<projectId>/docs?file=<encodeURIComponent(sourceFile)>` (the docs page is extended in §3a to read this query param and pre-select the file)
- Agent: `/projects/<projectId>/agents/<agentId>`

**Path format for docs:** `source_file` is stored as an absolute path (per §0). The helper computes the project-relative form by stripping `lookups.projectPath` if it's a prefix; the basename is taken from the (now relative) tail for display, and the URL-encoded relative form goes into the href. The Docs page reads `?file=` and selects the matching node by `relativePath`.

**Why kind `'task'` carries an optional doc link instead of two separate kinds:** Resolves the doc/task asymmetry surfaced in review — when a session is shown in the docs panel for `specs/foo.md`, the drawer's "From X" doesn't suddenly say "From <task>" with no doc reference. The drawer renders both. The grid card (which is space-constrained) renders only the primary task label.

The helper is pure — same inputs, same output, no I/O. Trivial to unit-test.

### 3. "Originated from this" — forward links

#### 3a. Docs page Sessions panel

**File:** `app/(dashboard)/projects/[projectId]/docs/page.tsx`

The panel mounts **directly below the rendered markdown body** for the currently-selected doc, inside the same scrollable content container. Layout sequence:

```
[doc header]
[markdown rendered body]
↓
[Sessions panel — new]
```

The panel section is omitted entirely when nothing is selected or when a folder (not a file) is selected.

The panel lists every session where `source_file === <selected doc.relativePath>`. Newest first (by `created_at`). Empty state when no sessions exist.

**Cross-cutting addition: docs page accepts `?file=<relativePath>` query param.** The drawer's "From X" link encodes the relative path; the docs page reads `useSearchParams().get('file')` on mount and pre-selects the matching node in the tree. If no match, falls back to the existing initial state (no selection). This requires wrapping the docs page in `<Suspense>` (per Next.js 16 `useSearchParams` rule, same pattern as the sessions-overview slice).

**Card layout** (each session is one card):

```
┌─────────────────────────────────────────────────────────┐
│ [phase-badge]  <session label>           ● Live | Done  │
│ started 3h ago · <phase> · ended 2h ago                 │
│                                                         │
│ <captured summary, line-clamp:3, "Show more" toggle>    │
│                                                         │
│ Open session ↗                                          │
└─────────────────────────────────────────────────────────┘
```

The whole card is wrapped in a clickable `<div role="button">` (same pattern as `SessionsGrid` from the sessions-overview slice). Click anywhere → `router.push('/sessions?selected=' + session.id)`. The "Open session ↗" affordance inside the card is a visual cue, not a separate target.

**Summary slot rule** (single source of truth):

```ts
if (!session.ended_at) "Session in progress…"
else if (session.summary) <truncated render with Show more>
else "No final message captured."
```

This rule is identical in §3c and §4a — implementer extracts a small helper if convenient.

The panel uses existing design tokens — `bg-bg-secondary`, `border-border-subtle` — to match the doc page's aesthetic.

#### 3b. Docs sessions API

**File:** `app/api/projects/[id]/docs/sessions/route.ts` — new GET endpoint.

```
GET /api/projects/[id]/docs/sessions?file=<relativePath>
→ Session[] ordered by created_at DESC
```

Implementation:

1. Read project row by `id`. 404 if not found.
2. Validate `file` query param. 400 if missing.
3. Compute `absolute = projectPath + '/' + relativePath` (or just `projectPath` joined; trailing-slash-safe).
4. Query `SELECT * FROM sessions WHERE project_id = ? AND source_file = ? ORDER BY created_at DESC` with the absolute form.
5. Return as JSON. Includes the new `summary` field.

The absolute conversion is the inverse of what the originator helper does for the href, so a roundtrip drawer→docs page→panel matches the right rows.

No paging (a doc rarely has more than a handful of sessions; if it does, that's a future problem).

#### 3c. Task detail "Past Sessions"

**File:** `components/tasks/TaskDetailView.tsx`

Below the existing `LiveRunsSection` (which already shows the active session for a task, line 118), add a new `PastSessionsSection` component that lists **ended** sessions where `task_id === <task.id>`. Same card shape as the docs panel.

**File:** `components/tasks/PastSessionsSection.tsx` — new file.

Fetches via the existing `useSessions({ projectId, status: 'all' })` hook (sessions-overview slice already uses this pattern). Filters client-side to `s.task_id === task.id && !!s.ended_at`.

The current `useSessions` hook accepts `{ status, projectId }` per `hooks/useSessions.ts:15` — no extension needed.

Summary-slot rule from §3a applies: ended sessions show summary or "No final message captured." (Active sessions for the task are already shown in `LiveRunsSection` so they don't appear here.)

If no ended sessions exist, show "No past sessions yet."

### 4. "Originated from" — reverse link

#### 4a. SessionDetailDrawer

**File:** `components/sessions/SessionDetailDrawer.tsx`

Add a small "From X" line in the drawer header, just below the session label row. Renders based on the originator kind returned by `getSessionOriginator`:

| Originator kind | Rendered |
|---|---|
| `'task'` (no doc sub-link) | `From <task title> ↗` (one clickable link) |
| `'task'` (with doc sub-link) | `From <task title> via <doc.md> ↗` (two clickable links) |
| `'doc'` | `From <doc.md> ↗` (one clickable link) |
| `'agent'` | `From Agent ↗` |
| `'standalone'` | `From standalone` (dim text, no link) |

The "↗" arrow uses the existing `<ExternalLink />` icon from lucide already imported by the drawer (verified at line 3).

The drawer adds one new hook call: `useTasks(session.project_id)` to provide `lookups.tasks` to the helper. React Query caches it; impact is negligible.

The links use Next.js `<Link>` (or `router.push` from `useRouter`). For the doc link, the href is `/projects/<projectId>/docs?file=<encoded>`, which the docs page (per §3a) pre-selects.

#### 4b. SessionGridCard

**File:** `components/sessions/SessionGridCard.tsx`

Add a "from <originator label>" segment to the existing meta row (currently `started <X> · <phase>`). Result:

```
started 3h ago · developing · from spec.md
```

For task originators with doc sub-links, the card shows ONLY the task label (compactness over completeness). For pure-doc originators, the doc basename. For agent, "Agent". For standalone, the segment is omitted entirely (don't clutter with "from standalone").

Static text, not clickable. The card's wrapping `<div role="button">` (in `SessionsGrid.tsx`) is the click target — clicking opens the drawer where the originator IS clickable.

The card adds one hook call: `useTasks(session.project_id)`. Same React Query cache benefit.

### Data flow

```
Session ends (lib/session-manager.ts)
  ↓
endSession(db, sessionId)            (existing)
  ↓
SELECT last assistant event from session_events  (NEW)
  ↓
UPDATE sessions SET summary = ?      (NEW)
  ↓
flushSessionEvents(db, sessionId)    (existing — deletes events, writes JSONL)
  ↓
emitSessionEnded(...)                (existing)

------ later, on UI surfaces ------

Docs page selects doc.relativePath
  ↓
useQuery → /api/projects/[id]/docs/sessions?file=<path>
  ↓
SessionsPanel renders card list with summary

Task detail page renders TaskDetailView
  ↓
PastSessionsSection uses useSessions filter task_id + ended_at
  ↓
renders card list with summary

SessionDetailDrawer renders Session
  ↓
getSessionOriginator(session, { tasks })
  ↓
"From X ↗" link in header

SessionGridCard renders Session
  ↓
getSessionOriginator(session, { tasks })
  ↓
"from X" string in meta row
```

### Failure modes

| Scenario | Behavior |
|----------|----------|
| Session killed before any assistant output | `summary` stays NULL; UI shows "No final message captured." |
| DB error during summary capture | try/catch logs warning; rest of session-end proceeds normally; `summary` stays NULL |
| Agent's final message is empty/whitespace | `TRIM(content, X'20090A0D') != ''` filter skips it; walks back to prior non-empty assistant message |
| `source_file` references a doc that was deleted | API still returns the session row with that `source_file`. Docs panel never renders for a deleted doc (selection is impossible). Drawer's "From X" link → 404 from docs page if clicked, but that's acceptable (orphan) — could show "From <deleted-doc.md>" with no link, but we accept the broken link as low-priority |
| `task_id` references a deleted task | Originator helper falls through to "Task <truncated id>" label with the link. Click → task page 404. Same acceptance as above |
| Same session shown in both docs panel AND task panel | Possible if a session was started with both `source_file` AND `task_id` (typical for spec/plan-phase sessions). Both surfaces show it — that's correct. Drawer renders "From <task> via <doc.md> ↗" with both links so the user can navigate either direction |
| Session row exists but `summary` is set on a still-active session (e.g. mid-development DB tinkering) | `useSessions` returns it; docs panel renders the summary even for live sessions. Acceptable — UI shows whatever the row says |
| Two simultaneous session-ends race for the same UPDATE | Single UPDATE statement on a single row. SQLite serializes writes via WAL. Last writer wins, but they're writing to different rows (different `sessionId`) so no conflict |
| Migration runs on existing DB with thousands of sessions | `ALTER TABLE ADD COLUMN` is fast (SQLite stores it as null until a row is updated). No data migration |

### Testing

**Unit:**

- `tests/db/session-summary.test.ts`:
  - Migration 64 adds `summary` column nullable
  - Capture: insert session_events with `role: 'assistant'` and content; call the capture helper; assert summary persists on the session row
  - Capture: when no assistant events, summary stays NULL
  - Capture: when last assistant event has empty content, walks back to prior non-empty
  - Capture: when DB throws, function logs and doesn't propagate

- `tests/sessions/originator.test.ts`:
  - All 5 resolution branches (task hit, task miss-but-id-set, doc, agent, standalone)
  - Doc label = basename, href has encoded path
  - Task hit returns task title

- `components/sessions/__tests__/SessionGridCard.test.tsx` (extend):
  - Renders "from <label>" segment for each originator kind

- `components/sessions/__tests__/SessionDetailDrawer.test.tsx` (extend):
  - Renders "From X ↗" link with correct href for doc/task/agent
  - Renders "From standalone" without a link when no fields set

- `components/tasks/__tests__/PastSessionsSection.test.tsx` (new):
  - Filters to ended sessions for the task
  - Empty state when no ended sessions
  - Renders summary, falls back to "No final message captured" when null

- `app/(dashboard)/projects/[projectId]/docs/__tests__/sessions-panel.test.tsx` (new):
  - Renders sessions for the selected doc
  - Click → navigation to `/sessions?selected=<id>`
  - "Session in progress…" for live sessions
  - "No final message captured" for ended-without-summary

- `app/api/projects/[id]/docs/sessions/__tests__/route.test.ts` (new):
  - Returns sessions filtered by `file` query param
  - 400 when `file` missing
  - Returns empty array for unknown file
  - Sorts newest first

**Integration / smoke (manual checklist):**

Saved as `docs/superpowers/specs/2026-05-02-session-summary-smoke.md`:

1. Open Docs page, pick a doc with no sessions → "No sessions yet" empty state
2. Start a session from that doc; while running, panel shows the live session card with "Session in progress…"
3. End the session via Stop in the drawer; reload docs page → card now shows the captured summary (the agent's last message)
4. Confirm summary text matches what was last visible in the terminal
5. Click the card → navigates to `/sessions?selected=<id>`, drawer opens with terminal scrollback
6. In the drawer, see "From <doc>.md ↗" header line; click it → navigates to the docs page with that file pre-selected (`?file=<path>`)
7. Open Sessions overview page; SessionGridCard shows "from <doc>.md" in meta row
8. Open task detail for a task with at least one ended session → "Past Sessions" section lists the session with its summary
9. Kill an active session before the agent emits any text → summary slot shows "No final message captured"
10. Verify the agent debrief is unchanged (we didn't touch debrief generation)

### Migration & rollout notes

- Migration 64 is additive only (`ALTER TABLE ... ADD COLUMN ... TEXT` nullable). Idempotent.
- No data migration. `source_file` keeps its existing absolute format.
- No changes to `app/api/sessions/route.ts`, `spawnSession`, `respawnSessionWithProvider`, or `getActiveSessionForFile`.
- Capture logic is a try/catch — DB errors don't break session-end.
- No API removed; docs/sessions endpoint is purely additive.
- No new dependencies.

### Out of scope (explicit)

- Backfilling summaries for historical sessions (would need re-reading flushed JSONL files; future feature).
- LLM-generated summaries (the user explicitly said "summary as in final summary from agent" — no second LLM pass).
- Diffs of files changed in the session (already covered by git activity views).
- Pinning / favoriting summaries.
- Editing or annotating captured summaries.
- Agent-originated session UI surface.
- Showing summaries in `/timeline` or `/inbox` (those views work off events, not direct session rows; possible follow-up).

## Open Questions

None — design fully locked.

## Risk Acceptance

- **Captured summary is just the last assistant message.** If the agent's final turn is a tool call followed by silence, we walk back to the previous text turn. If the agent's final text is "OK." (genuinely uninformative), that's what we store. The captured text quality reflects the agent's quality; no second-pass curation.
- **Doc renames break the link.** If a doc is renamed/moved, sessions tied to it via `source_file` keep the old path. The Docs page panel won't show those sessions on the new path. The drawer's "From X" link will navigate to a now-deleted file. Acceptable for v1; future iteration could keep a path-history or tie via inode/UUID.
- **Spec/plan files appear in the docs panel.** Files like `specs/foo.md` are part of the docs tree and any session whose `source_file` matches will appear when the user opens that file in the Docs page. This is the intended behavior — those files ARE docs.
- **Ollama sessions don't get summaries.** The Ollama adapter doesn't normalize to `role: 'assistant'`, so its events are skipped by the capture query. Sessions render "No final message captured." Out of scope to fix in this slice.
- **Project `path` change after sessions are recorded.** If a project's filesystem path is moved/renamed after sessions are recorded, the absolute paths stored in `source_file` no longer match the project root. The docs API will compute a different absolute (newPath + relative) and return zero matches; sessions on the old path would orphan. Acceptable for v1 — moving project paths is rare and the user can re-launch sessions on the new path. No detection or self-healing in this slice.
