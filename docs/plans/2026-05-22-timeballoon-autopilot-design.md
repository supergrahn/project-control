# TimeBalloon Autopilot — Design

Bring TimeBalloon and project-control into one loop so the answer to "where did my time go?" is *always already computed*. Goal: zero manual time entry, every minute attributed to a project (and where possible a task), via automatic capture plus a daily one-tap review.

## Scope and non-goals

**In scope** — thirteen features grouped into four phases:

- **Phase 0** — unified project model across local repos, project-control projects, and external boards (Monday, DoneDone, Jira).
- **Phase 1** — four originally-proposed integrations (alias reconciliation, `last_used_at` from real activity, row→task linking, LLM enrichment for Monday tasks with a Q&A loop).
- **Phase 2** — autopilot features (session auto-link, end-of-day sweep, pattern learning).
- **Phase 3** — hours-as-value: turn the day's actual evidence (commits, manual notes, off-PC entries, calendar) into a fillable timesheet line. Solves the immediate "I need 7.5h on Monday but the tracker only saw 3" pain.

**Out of scope** — browser tab tracking, Slack/email parsing, manual start/stop timers, Monday write-back of LLM output, cross-project pattern matching of tickets.

## Architecture summary

```
┌──────────────────────────┐                  ┌──────────────────────────┐
│  TimeBalloon (Tauri/Mac) │  ←—— WS push ——  │  project-control (um890) │
│  ─ daily_timesheet       │ ←—POST /sync——   │  ─ projects              │
│  ─ project_aliases       │ ──GET  /state──→ │  ─ tasks (mirror)        │
│  ─ known_projects        │ ──GET  /tasks──→ │  ─ task_source_config    │
│  ─ gap_hints             │ ──GET  /projects→│  ─ external adapters     │
│  Local SQLite SoT        │                  │  ─ task-prep (LLM)       │
└──────────────────────────┘                  │  ─ session-manager       │
                                              └──────────────────────────┘
```

Local SQLite remains the source of truth on the Mac. project-control aggregates external project/task data and is the source of truth for everything to its right. Sync stays bidirectional via the existing `/api/timeballoon/{sync,state}` + `/ws/timeballoon` channel, with new endpoints layered alongside.

All LLM use is local (llama.cpp / Ollama on um890 via `lib/router/localComplete.ts`) — sensitive activity data never leaves the tailnet.

---

## Phase 0 — Unified project model (foundation)

Everything else builds on this; ship it first.

### Concept

A timesheet row can be attributed at three granularities:

- **Local repo path** — `/Users/me/src/foo` — auto-detected from file activity.
- **Project-control project** — `pc:<uuid>` — a registered repo in project-control. May have multiple external boards configured.
- **External board** — `monday:<board_id>` or `donedone:<project_id>` or `jira:<project_key>` — a task source within a project-control project.
- **Task** — `source + source_id` — the most granular; covered in Spec 3.

### Schema changes

**project-control** — no schema changes. The data already exists across `projects` and `task_source_config`.

**TimeBalloon SQLite** — add two columns to `daily_timesheet`:

```sql
ALTER TABLE daily_timesheet ADD COLUMN project_ref TEXT NULL;
ALTER TABLE daily_timesheet ADD COLUMN task_ref    TEXT NULL;
```

`project_ref` values: `local:<path>` | `pc:<uuid>` | `monday:<board_id>` | `donedone:<project_id>` | `jira:<project_key>`. `task_ref` only set when row is pinned to a specific task: `<source>:<source_id>` (e.g. `monday:90271`).

Mirror columns added on the project-control side in `timeballoon_daily_timesheet`.

### New endpoint

```
GET /api/timeballoon/projects
→ [
    {
      id: "<pc-uuid>", name: "timeballoon", path: "/home/.../timeballoon",
      sources: [
        { source: "monday",   resource_id: "1234567", resource_name: "Customer Portal" },
        { source: "donedone", resource_id: "DDP-9",   resource_name: "Bugs Backlog" },
      ]
    }, …
  ]
```

Bearer-auth same as existing timeballoon endpoints. Tauri caches the result, refreshes on WS reconnect, exposes it to the attribution UI.

### Data flow

Tauri queries the endpoint on app boot and on `/ws/timeballoon` reconnect. Result cached in-memory + persisted to a `projects_cache` table for offline use. Any row attribution UI reads from this cache.

---

## Phase 1 — Initial integrations (Specs 1-4)

### Spec 1 — Project label reconciliation

Was previously about path-based name matching. Now subsumed by Phase 0's unified model:

- Tauri renders a row's project label by resolving `project_ref` through the projects cache.
- For `local:<path>` rows, look up the path in `projects[].path` and use that project's `name` if found; else last path segment.
- For `pc:<uuid>`, `monday:<id>`, etc., resolve directly from the cache.

No separate endpoint or schema. Effort: half a day in Tauri once Phase 0 ships.

### Spec 2 — `last_used_at` from real activity

On the server, in `POST /api/timeballoon/sync`'s handler, when an event is an `upsert` on `daily_timesheet` whose `project_ref` resolves to a `pc:<uuid>` (directly or via path lookup), do:

```ts
db.prepare(
  'UPDATE projects SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)'
).run(row.end_ts, projectUuid, row.end_ts)
```

Project-control's existing project switcher already sorts by `last_used_at`. Effort: half a day.

### Spec 3 — Row ↔ task linking

Already half-designed in Phase 0 (added `task_ref` column).

**New endpoint**:

```
GET /api/timeballoon/tasks?project_id=<pc-uuid>&q=<search>
→ [{ task_ref: "monday:90271", title: "...", source: "monday", status: "...", priority: "..." }, …]
```

Proxies `getExternalTasks(...)` scoped to a project, filtered to non-deleted. Bearer-auth.

**Tauri UI** — per-row "assign task" menu (cmd-K style search filtered to tasks under the row's `project_ref`). Selection writes `task_ref` + queues an outbox event.

**Reports** — a new `/projects/:id/time` view in project-control joins `tasks` ⋈ `timeballoon_daily_timesheet.task_ref` (the mirror table already exists, just needs the new column). Renders "time per task this week / month."

Effort: ~3 days for endpoint + Tauri UI + report.

### Spec 4 — LLM enrichment of Monday tasks with Q&A loop

Mostly built on top of the existing `lib/prep/` infrastructure from the `task-prep` slice on origin/main.

**Two changes**:

1. **Restrict auto-trigger to Monday**: in `syncService.ts`, gate the existing post-sync `void prepareTask(db, id)` call on `task.source === 'monday'` (or any source in `process.env.PREP_AUTO_SOURCES ?? 'monday'`). Other sources keep their manual `POST /api/tasks/:id/prepare` route.

2. **Q&A loop**: extend `PrepNotes` JSON shape:

   ```ts
   type PrepNotes = {
     summary: string            // existing
     relevant_files: string[]   // existing
     questions: Array<{         // NEW
       id: string
       question: string
       answer: string | null    // null until user answers
       asked_at: string
     }>
   }
   ```

   Prompt update (in `lib/prep/prompts.ts`): when source is `'monday'`, also ask for 1-3 "how do you plan to solve this" questions. They land with `answer: null`.

   **New route**: `POST /api/tasks/:id/prep/answer { question_id, answer }` writes the answer into `prep_notes.questions[]`.

   **UI**: in `ExternalTaskDetailDrawer`, a Questions panel below the existing prep section. Inline answer fields per question; submit triggers the route and queues a follow-up `prepareTask` run that regenerates `summary` grounded in the user's plan, then clears `questions`.

   **Session injection** (already exists): the injected prep now includes "Approach (per user)" from the answered questions.

Hard non-goals: no write-back to Monday, no chat, one round-trip per task max.

Effort: ~1 week for polished UX, ~2 days for "ask, show, store, regenerate-once" MVP.

---

## Phase 2 — Autopilot (Specs A-E)

Order: A → B → C → E → D (in shipping priority).

### Spec A — Session auto-link

When project-control's session-manager spawns a session bound to a task, push a `(task_ref, start_ts, end_ts)` window to TimeBalloon on session end via the existing `/ws/timeballoon` channel. Tauri receives the window and back-fills any timesheet row inside it whose `task_ref` is null.

**Server side**:

- In `lib/session-manager.ts`, after a task-bound session ends, push:
  ```json
  { "type": "session-window", "task_ref": "monday:90271", "start_ts": "...", "end_ts": "..." }
  ```
- Add the new message type to the `/ws/timeballoon` bus.

**Tauri side**:

- WS handler receives `session-window`, runs `UPDATE daily_timesheet SET task_ref = ? WHERE start_ts >= ? AND end_ts <= ? AND task_ref IS NULL`, queues outbox events for the updated rows.

Highest-leverage feature for the user's goal — zero manual input, deterministic. Effort: ~2 days.

### Spec B — End-of-day sweep

A view in TimeBalloon (and mirrored at `/timeballoon/today` on the project-control mobile page) showing only *unattributed* time for today.

For each gap:

- Show start/end + duration.
- Show up to 5 "guess" suggestions: project_refs and task_refs from surrounding attributed rows, recently-opened files, calendar events overlapping the window (Spec C), tasks in-progress in project-control.
- One-tap commit attribution; queue outbox events.

Suggestion ranking via simple weighted heuristic for v1; replace with pattern-learning model in Spec D.

Effort: ~3-4 days for Tauri UI; ~1 day for the mirrored mobile view.

### Spec C — Calendar import (read-only)

Server-side OAuth (Google Calendar + Microsoft 365) keeps tokens off the laptop. Periodic poll (every 10 min) fetches today + tomorrow events into a new `external_events` table on the server.

`/ws/timeballoon` pushes new events; Tauri creates pre-attributed timesheet rows:

- If event title matches a known project name or contains a known task identifier, auto-link `project_ref` / `task_ref`.
- Else create the row with `project_ref = 'meetings:unassigned'` and surface in the end-of-day sweep.

Skip events marked "transparent" or shorter than 5 min.

Effort: ~1 week (OAuth + poller + Tauri integration). The two providers can ship independently.

### Spec D — Pattern learning (local LLM)

After a few weeks of corrected attributions, train a lightweight classifier that maps `(active_path, time_of_day, file_extension, surrounding_rows)` → `(project_ref, task_ref)`. Run inference on the local model.

**Training signal**: every time a user accepts or corrects a suggestion in Spec B, write a `(features, label)` row into a `learning_signals` table. After 100+ signals, periodically run a fine-tune or build an in-context-learning prompt for the local LLM.

**Inference**: Spec B's suggestion ranker calls the model first; high-confidence predictions (>0.8) auto-attribute without showing a prompt, low-confidence falls through to the existing heuristic ranker.

Defer until B + sufficient correction data exists. Effort: ~1-2 weeks.

### Spec E — Git commits as backfill evidence (deprecated — superseded by Spec H)

Original idea: use `git log` as evidence to fill timesheet gaps. Folded into the richer commit-estimator in Phase 3 (Spec H), which uses commits as the *primary* source of billable hours rather than just gap evidence.



A commit proves "I was in this repo until just now." Widen `gap_hints` consumption to include:

- For each known project's `path`, run `git log --since=<gap_start>` to find commits during gaps.
- Any gap ending within 60s of a commit gets a pre-filled suggestion in Spec B: `project_ref = <pc-uuid for that path>`.

Fully passive, very high precision. Effort: ~1 day (single new function + plug into Spec B's ranker).

---

---

## Phase 3 — Hours-as-Value (Specs G-J)

The principle: a timesheet hour should reflect *value delivered*, not *time at the keyboard*. With AI agents doing supervised work, screen-time captured by TimeBalloon underrepresents the actual junior-developer-equivalent effort produced. Phase 3 closes that gap with four pieces.

### Spec G — Hourly check-in prompts

Validated by real data: the single most useful entry on May 19 was a one-line **manual** note ("Startet dagen og fullførte liste over routes som må endres i APP og frontend"). Surfacing similar notes throughout the day makes the auto-classifier and description generator dramatically more accurate.

- Every 60 min (configurable; skipped when laptop locked or a calendar event is in progress), TimeBalloon shows a small unobtrusive prompt: *"What are you doing right now?"*
- One-line input in any language; dismissable.
- Stored as a `minute_summary` row with `source='manual'`.
- The hourly LLM summarizer treats manual entries as ground truth — the auto-summary for that hour gets rewritten around the manual note.
- Pattern learning (Spec D) weights manual entries 10× higher.
- End-of-day sweep (Spec B) and the Days-view description generator both prefer manual notes when present.

Cost: small Tauri UI (corner toast + input), zero schema work (`source` column exists). Effort: ~2 days.

### Spec H — Per-commit estimator: "junior-dev equivalent hours"

The flagship Phase 3 piece. Turns AI-accelerated work into honest billable time.

**Schema** (Tauri):

```sql
CREATE TABLE commit_estimations (
    commit_sha TEXT PRIMARY KEY,
    repo_path TEXT NOT NULL,
    author_email TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    estimated_hours REAL NOT NULL,
    confidence REAL NOT NULL,
    reason TEXT,
    user_override_hours REAL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL
);
```

**Flow**:

1. For each `known_projects.path` (or each path registered as a project-control project), find commits authored by the user on the given date — `git log --author=<email> --since=<date> --until=<date+1>`.
2. For each new SHA, run `git show --stat <sha>` + a truncated `git show -U3 <sha>` (cap at ~8KB) and feed both to the local LLM with this prompt:

   > *You estimate timesheet hours for a software developer. Given the commit message + file list + truncated diff, estimate how many hours a **junior developer with basic familiarity with this codebase** would spend producing this commit (writing, testing, learning context, debugging). Return JSON: `{"hours": <number>, "confidence": 0.0-1.0, "reason": "<one sentence>"}`. Be realistic about library-call boilerplate vs. genuinely new logic.*

3. Persist the result. Allow `user_override_hours` to be set from the UI when the LLM is obviously wrong.

**UI** — each day card in the Days view gets three numbers instead of one:

| Number | Source | Display |
|---|---|---|
| `Captured` | screen time minus leisure | `5.8 h` |
| `Junior-equiv` | sum of estimated_hours for the day's commits + manual off-PC entries | `12.3 h` |
| `Reported` | what the user chooses to bill (defaults to min(target, junior-equiv); editable) | `7.5 h` |

A "commits" panel per day lists each commit with its estimate, expandable to show the LLM's reasoning. Hover any number to edit the override.

**Non-goals**:

- No multi-commit context (each commit estimated in isolation; chaining context is a v2 nicety).
- No team-baseline ("how long did Alice take on a similar PR") — too much infra for too little gain.
- No external timesheet system write-back. Copy-paste only (Spec J).

Effort: ~3 days. Hardest part is keeping diffs short enough to fit in the local LLM's context while preserving signal — likely a per-file summary pass for large diffs.

### Spec I — Off-PC capture stack

Three layers, ship in order:

**I.1 — Quick-add ad-hoc entries** (afternoon)

A `+ Off-PC` button on each day card opens a small form: time range, project_ref, description. Writes to a new table `off_pc_entries(uuid, date, start_time, end_time, project_ref, task_ref, description, source='manual')`. Mirrors via outbox to the project-control side. Counts in the day's `Junior-equiv` total.

**I.2 — Calendar import** (1 week, biggest single win)

- Server-side OAuth (Google Calendar + Microsoft 365), tokens encrypted at rest, never sent to Tauri.
- Periodic poller (every 10 min) fetches today + tomorrow events into a server-side `external_events` table.
- `/ws/timeballoon` pushes new events; Tauri creates pre-attributed `off_pc_entries` rows.
- If event title matches a known project name or contains a known task identifier, auto-link `project_ref` / `task_ref`. Otherwise unassigned, surfaced in Spec B's end-of-day sweep.
- Skip events marked "transparent" or shorter than 5 minutes.

(Originally listed as Spec C; promoted into Spec I as the calendar piece of off-PC capture, where it belongs.)

**I.3 — End-of-day prompt** (1 day)

When the Days view opens after 17:00, if any day in the current week has `Reported < target`, show a single inline prompt at the top:

> *"Tirsdag still needs 2.5h. Anything off-screen — meetings, calls, planning? Add quickly:"* `[text field]`

User types a free-form description + duration; it becomes an `off_pc_entries` row attributed to the day's dominant project. Dismissable.

Effort total: ~1.5 weeks (mostly the calendar OAuth).

### Spec J — Copy-paste ergonomics

A `📋 Copy` button on each day card writes the formatted timesheet line to the clipboard:

```
{Day name in NO} ({day. month}): {project} - {hours}t - {description}
```

Settings panel offers:

- **Format template** (string with `{day}`, `{date}`, `{project}`, `{hours}`, `{description}` placeholders).
- **Project name source** — pc project name, raw timesheet project, or custom alias.
- **Hours mode** — `Reported` (default) or `Captured`.
- **Language** — currently nb-NO (Norwegian bokmål); en for the LLM description generator.

A `Copy week` button at the top of the Days view bundles all days into a multi-line block (mirrors the existing Week view's button).

Effort: ~1 day total. Useful immediately even without Spec H; gets much better with H.



### Schema migration

Both sides need migrations. project-control already has a migration framework (`lib/db.ts` `runMigration`); TimeBalloon's Tauri side needs the same pattern if not already present. For the mirror tables, project-control's existing migration system handles them.

### Sync protocol additions

The current `outbox event` shape needs two new fields (`project_ref`, `task_ref`) on `daily_timesheet` upserts — additive, no protocol version bump needed.

Two new WS message types: `session-window` (Spec A), `calendar-event` (Spec C). Add to `handleTimeballoonSocket` switch.

### Error handling

- `GET /api/timeballoon/projects` and `GET /api/timeballoon/tasks` return last-known cached data + a header `X-Stale: true` if the underlying adapters errored. Tauri shows degraded data with an indicator rather than blocking the UI.
- WS push messages are best-effort; reconciliation on reconnect via `GET /api/timeballoon/state?since=...` already handles drops.
- Q&A endpoint validation: `question_id` must match an existing entry in `prep_notes.questions` (rejects unknown IDs cleanly).

### Testing

- Unit tests for the new endpoints (`/api/timeballoon/{projects,tasks}`, `/api/tasks/:id/prep/answer`).
- Integration test for syncService's auto-attribution from `daily_timesheet` upsert → `projects.last_used_at` bump.
- E2E manual smoke checklist for the end-of-day sweep (Spec B) covering edge cases: empty timesheet, all-attributed, no calendar data.

### Privacy

All LLM calls go to local providers (llama.cpp/Ollama on um890). Calendar tokens stored encrypted on server, never sent to Tauri. No third-party telemetry from the integration code.

---

---

## Phase 4 — Marathon-ready timesheet output (Specs N-P)

Goal: every day, paste a Marathon-shaped block straight into the form with zero re-typing and zero project-code lookup. project-control on um890 holds the authoritative project + Marathon-code catalogue; TimeBalloon pulls it down and uses it as ground truth in LLM grouping and export.

### Spec O — project-control becomes the project + code source of truth

(Build this first — N and P depend on it.)

**Schema (project-control)**:

```sql
-- additive on the existing projects table
ALTER TABLE projects ADD COLUMN marathon_code        TEXT;     -- e.g. "063"
ALTER TABLE projects ADD COLUMN marathon_account     TEXT;     -- e.g. "1100" (client code)
ALTER TABLE projects ADD COLUMN marathon_default_wt  TEXT;     -- e.g. "063 - Backend programmering"

-- new catalogue: the work-type code list (currently TimeBalloon-local only)
CREATE TABLE work_type_codes (
  id         INTEGER PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  marathon_legacy_code TEXT,  -- for clients whose Marathon instance uses different IDs
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**New endpoint (project-control)**:

```
GET  /api/timeballoon/projects-catalogue
→ {
    projects: [{ id, name, path, marathon_code, marathon_account, marathon_default_wt, sources: [...] }],
    work_type_codes: [{ code, name, marathon_legacy_code }]
  }
```

Bearer-auth same as existing `/api/timeballoon/*`. Returned in a single round-trip on app boot + WS reconnect; cached in a `projects_catalogue_cache` table on the Tauri side.

**Tauri side**:

- TimeBalloon's existing `known_projects.code` becomes a **cache** of `marathon_code`, not the source.
- `work_type_codes` table becomes a cache of the server-side catalogue.
- New WS event: `projects-catalogue-updated` — when the server-side codes change, every Tauri client refetches.
- The settings UI for editing codes lives on **project-control** (a small `/settings/marathon-codes` page); TimeBalloon's code-editing fields become read-only chips.

Effort: ~2 days (server endpoint + Tauri sync + the small admin page on project-control).

### Spec P — Task-aware bucket validation

The Spec M LLM grouping needs to know which tasks are real on project-control vs. hallucinated. Today it's optimistic; with this spec, it's grounded.

- The `compose_day_buckets` LLM call gets a **complete** active-task list from project-control (paginated if needed) — currently only the most recent 30 are passed.
- Output validation: any `task_ref` the LLM returns must match `<source>:<source_id>` of a known task or be `null`. Unknown task_refs are stripped + flagged.
- The Day view shows a warning chip on buckets where the LLM was <70% sure of the task assignment: `⚠ Confirm task`. Click to open a search-filtered task picker (search against pm_tasks).
- A bucket's hours can be split across multiple tasks — the user clicks `Split` to break it into two rows.

Effort: ~3 days. Most of it is the task picker UI and the split logic.

### Spec N — Marathon export

The flagship UX piece. Single button per day, week-rollup button at the top.

**Per-day `📋 Copy to Marathon`** button on each task-grouped bucket. Produces this for each bucket:

```
<date>    <marathon_code>    <work_type_code>    <hours>    <description>    <task_ref>
```

(Tab-separated; configurable in settings.) The bucket's user-edited description is what gets exported, with the task title appended in parens if `task_ref` is set.

**Week-rollup `📋 Copy week`** button copies all days' lines in order, ready to paste into Marathon's batch entry form.

**Validation badge** per day, shown next to the date in the Day view:

| Badge | Meaning |
|---|---|
| `✓ Marathon-ready` (green) | All buckets have project_code + work_type_code + hours sum to within ±10% of contracted hours |
| `⚠ N issues` (amber) | Click to see: missing codes, hours don't sum, unconfirmed tasks |
| `✗ Locked` (gray) | Day was already exported (write-back protection — see below) |

**Export-lock signal** — when the user copies a day's lines to clipboard, TimeBalloon marks that date with `marathon_exported_at = now()`. Re-copying shows a confirmation: *"Marathon entries for this date were copied 2 hours ago. Copy again?"* Prevents double-submission.

**Manual override** — every field on every bucket stays editable up to the export-lock moment, and the unlock is one click away.

Effort: ~3 days. Mostly UI plumbing; the data is already on the Tauri side via Specs O+P.

### Cross-phase data flow summary

```
project-control (um890)
  ├─ projects[].marathon_code           (Spec O)
  ├─ projects[].marathon_account
  ├─ projects[].marathon_default_wt
  └─ work_type_codes[].code/name        (Spec O)
       │
       ▼  /api/timeballoon/projects-catalogue
       │
TimeBalloon (Mac, local SQLite cache)
  ├─ projects_catalogue_cache
  ├─ work_type_codes (cached)
  ├─ daily_timesheet rows               (existing)
  ├─ commit_estimations                 (Spec H)
  ├─ off_pc_entries                     (Spec I.1)
  ├─ day_buckets (LLM-composed)         (Spec M)
  │     └─ uses cached codes + tasks
  │     └─ validated via Spec P
  └─ marathon_exports (date, payload, exported_at)
       │
       ▼  📋 Copy → clipboard
       │
Marathon timesheet form (web UI)
```

Each layer is a clear boundary: codes flow down, entries flow out.

### Phase 4 ship order

```
1.  Spec O (server-side codes + sync)        [2d]
2.  Spec P (task-aware bucket validation)    [3d]
3.  Spec N (Marathon export + validation)    [3d]
```

Total ~8 days. Phase 4 depends on Phase 0 (unified project model) being done; with that in place, the codes and task-refs already have a clean home.

### Open questions for execution (Phase 4)

- **Marathon project codes per client vs. global** — does the same project always have the same Marathon code, or does it vary by client/contract? If per-client, `marathon_code` becomes `(client_id, code)`.
- **Hours rounding** — Marathon almost certainly accepts decimal hours; do we round to 0.25h, 0.1h, or whole minutes? Probably 0.25h by convention; configurable.
- **What about `work_type` for off-PC entries** — meetings should probably default to a "020 - Møter" code; needs to live as a known default on `off_pc_entries.work_type_code` and surfaced as a quick-pick in the I.1 form.
- **Re-export after edits** — if you correct a bucket after exporting, the system should know the lock is stale. Diff the current buckets against the last exported snapshot; if changed, show `⚠ Re-export needed`.

---

## Branching and deployment

- **Do NOT** add any of this to `feature/timeballoon-sync` (the current um890 deploy). That branch is frozen as a snapshot of pre-divergence work.
- All Phase 0/1/2 work lands on `origin/main` through the normal `feature/<slice>` → review → merge flow.
- After main merges, redeploy um890 via the standard release path. The current sync-only deploy gets replaced by a full main build.

## Ship order

```
PHASE 0 — Foundation
0.  Unified project model              [2d]

PHASE 3 — Hours-as-Value (highest immediate utility for timesheet pain)
1.  Spec J (copy-paste ergonomics)     [1d, no deps — ship FIRST, instant payoff]
2.  Spec H (per-commit estimator)      [3d, no deps]
3.  Spec G (hourly check-in prompts)   [2d, no deps]
4.  Spec I.1 (quick-add off-PC)        [0.5d, no deps]

PHASE 1 — Integrations
5.  Spec 1 (alias display)             [0.5d, depends on 0]
6.  Spec 2 (last_used_at)              [0.5d, depends on 0]
7.  Spec A (session auto-link)         [2d, depends on 0]
8.  Spec 3 (row↔task UI)               [3d, depends on 0]
9.  Spec 4 (Monday LLM Q&A)            [5d, depends on origin/main task-prep]

PHASE 2 — Autopilot
10. Spec I.2 (calendar import)         [5d, depends on 0]
11. Spec B (end-of-day sweep)          [4d, depends on 0+A+I.2]
12. Spec I.3 (end-of-day prompt)       [1d, depends on B+H]
13. Spec D (pattern learning)          [10d, depends on B + correction data]
```

**Why this order changed**: the immediate pain you surfaced — "I need to register 7.5h on Mon/Tue/Thu/Fri but the data shows ~3-5h on the computer" — is solved by Phase 3, not by the original Phase 1/2 work. Spec J (Copy) + Spec H (junior-equiv hours) + Spec G (hourly prompts) directly turn the day's evidence into a fillable timesheet. Phase 1/2 then build on top to remove manual attribution friction.

**~8 weeks total** if everything ships; Phase 3 alone (~7 days of focused work) closes the timesheet gap for now. Phase 1+2 are the *ambient quality-of-life* tier — every minute auto-attributed, calendars imported, sweeps showing only the unknown — that gets you to "never look for your time again."

## Open questions for execution

These don't block the design but want resolving before each spec's plan:

- **Spec 0**: should `project_ref` be a true foreign key into `known_projects` (with a new `external_project_id` column) or a free-form string with a parser? Free-form string is simpler, FK is safer — leaning string for v1.
- **Spec 4**: when the user updates an answer, do we throw away the old `summary` and regenerate fully, or do an incremental edit? Full regen is simpler and probably cheaper than careful prompt engineering for incremental.
- **Spec C / I.2**: do we want recurring events to create one timesheet row per occurrence, or one ongoing entity? Per-occurrence matches user mental model.
- **Spec D**: minimum signal count before turning on auto-attribution? Heuristic: 50+ corrected suggestions in a category before that category gets auto-attributed.
- **Spec H**: how do we present the *gap* between `Captured` and `Junior-equiv`? On Monday May 18 the gap was huge (3h captured vs ~0.5h commit-estimate vs 7.5h target). The honest answer is "this day is hard to justify"; do we surface that as a warning chip on the day card, or silently let the user reconcile? Leaning warning chip.
- **Spec H**: what about commits that aren't tied to a tracked project (personal repos, OSS, dotfiles)? Currently they'd be ignored. Probably right for v1.
- **Spec H**: should the estimator account for *review* effort too — i.e. when you review a teammate's PR and leave comments? Probably yes, but data source (GitHub API events) is a separate integration; defer to v2.
- **Spec I.2**: which calendars to import? All? Only marked "work"? Leaning all + a per-event opt-out toggle.
- **Spec J**: clipboard format — single TSV line vs. multi-line block? Settings panel exposes both.
