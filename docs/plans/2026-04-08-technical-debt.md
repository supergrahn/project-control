# Technical Debt Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all structural and correctness issues identified in the April 2026 codebase critique, excluding test improvements.

**Architecture:** Work from the database outward — migrations first (foundational), then data integrity, then duplicate/scattered logic, then client-side patterns, then small bugs. Each task is independently committable.

**Tech Stack:** Next.js 16.2.1 App Router, better-sqlite3, SWR, TypeScript, Vitest

---

## Task 1: Add DB migration versioning to `lib/db.ts`

**Problem:** 66 `try { db.exec(...) } catch {}` blocks silently swallow migration errors. Failed migrations are invisible; the schema may be partially applied with no indication.

**Files:**
- Modify: `lib/db.ts`

**Step 1: Read the current migration table setup**

Scan `lib/db.ts` lines 46–345 to understand all existing migration blocks.

**Step 2: Add a `schema_migrations` table at the top of `initDb`**

After `db.pragma('foreign_keys = ON')` and before the initial `db.exec(...)` that creates `projects`/`sessions`/`settings`, insert:

```ts
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version  INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`)
```

**Step 3: Create a `runMigration` helper**

Add this function just above `initDb`:

```ts
function runMigration(
  db: Database.Database,
  version: number,
  name: string,
  sql: string,
): void {
  const already = db
    .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
    .get(version)
  if (already) return
  db.transaction(() => {
    db.exec(sql)
    db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    ).run(version, name, new Date().toISOString())
  })()
}
```

**Step 4: Convert every `try { db.exec(...) } catch {}` block to a numbered `runMigration` call**

Assign sequential version numbers starting from 1. Use a short descriptive name for each. Example conversions:

```ts
// Before:
try { db.exec(`ALTER TABLE sessions ADD COLUMN ended_at TEXT`) } catch {}

// After:
runMigration(db, 1, 'sessions_ended_at', `ALTER TABLE sessions ADD COLUMN ended_at TEXT`)
```

For the initial `CREATE TABLE IF NOT EXISTS` block (projects/sessions/settings), keep it as-is since it uses `IF NOT EXISTS` and is safe to re-run.

**Step 5: Keep `runTaskSourceMigration` but wrap its inner exec calls with the same helper or inline the transaction**

The function at line 348 already uses a proper transaction and PRAGMA checks — leave its logic intact, just remove the outer bare `try/catch` and let real errors surface.

**Step 6: Run the app and confirm startup**

```bash
npm run dev
```

Expected: server starts, no error output about migrations, `schema_migrations` table exists in `data/project-control.db`.

**Step 7: Commit**

```bash
git add lib/db.ts
git commit -m "refactor: replace silent migration try/catch with versioned runMigration helper"
```

---

## Task 2: Replace hard-delete with soft-delete on task sync

**Problem:** `syncService.ts` deletes tasks that are no longer returned by the adapter. If the adapter has a transient failure or returns an empty list, all synced tasks are wiped.

**Files:**
- Modify: `lib/db.ts` (add `is_deleted` column migration)
- Modify: `lib/taskSources/syncService.ts`

**Step 1: Add `is_deleted` migration**

Using the `runMigration` helper from Task 1:

```ts
runMigration(db, <next_version>, 'tasks_is_deleted', `
  ALTER TABLE tasks ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0
`)
```

**Step 2: Read `syncService.ts` lines 60–100 to find the delete logic**

Look for the `DELETE FROM tasks WHERE project_id = ? AND source = ? AND source_id NOT IN (...)` statement (or equivalent).

**Step 3: Replace the DELETE with a soft-delete UPDATE**

```ts
// Before (hard delete):
db.prepare(`
  DELETE FROM tasks
  WHERE project_id = ? AND source = ? AND source_id NOT IN (${placeholders})
`).run(projectId, adapterKey, ...incomingIds)

// After (soft delete):
db.prepare(`
  UPDATE tasks SET is_deleted = 1, updated_at = ?
  WHERE project_id = ? AND source = ? AND source_id NOT IN (${placeholders})
`).run(new Date().toISOString(), projectId, adapterKey, ...incomingIds)
```

Also un-delete tasks that reappear:

```ts
db.prepare(`
  UPDATE tasks SET is_deleted = 0, updated_at = ?
  WHERE project_id = ? AND source = ? AND source_id IN (${placeholders})
`).run(new Date().toISOString(), projectId, adapterKey, ...incomingIds)
```

**Step 4: Filter `is_deleted = 0` everywhere tasks are queried**

Search for all places tasks are fetched:

```bash
grep -rn "FROM tasks" lib/ app/api/ --include="*.ts"
```

Add `AND (is_deleted = 0 OR is_deleted IS NULL)` to each query that lists tasks (not single-ID lookups by primary key).

**Step 5: Run the app and trigger a sync**

Expected: tasks disappear from the UI when the adapter no longer returns them, but the DB row is preserved with `is_deleted = 1`.

**Step 6: Commit**

```bash
git add lib/db.ts lib/taskSources/syncService.ts lib/db/tasks.ts
git commit -m "fix: soft-delete synced tasks instead of hard-delete to prevent accidental data loss"
```

---

## Task 3: Fix stale comments — replace INSERT OR IGNORE with upsert

**Problem:** `syncService.ts` uses `INSERT OR IGNORE` for task comments, so comment edits in the source system are never reflected in the DB.

**Files:**
- Modify: `lib/taskSources/syncService.ts`

**Step 1: Find the comment insert in `syncService.ts`**

Look for the `INSERT OR IGNORE INTO task_comments` statement.

**Step 2: Replace with an upsert**

```ts
// Before:
db.prepare(`
  INSERT OR IGNORE INTO task_comments
    (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(...)

// After:
db.prepare(`
  INSERT INTO task_comments
    (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, task_source_id, comment_id) DO UPDATE SET
    author    = excluded.author,
    body      = excluded.body,
    synced_at = excluded.synced_at
`).run(...)
```

**Step 3: Run the app and verify comments update**

Edit a comment in your connected source system, trigger a sync, confirm the updated body appears in the Inbox.

**Step 4: Commit**

```bash
git add lib/taskSources/syncService.ts
git commit -m "fix: upsert task comments on sync so edits in source system are reflected"
```

---

## Task 4: Eliminate duplicate status mapping

**Problem:** Each adapter has `mapStatus(raw)` / `mapPriority(raw)`, but `app/api/projects/[id]/external-tasks/route.ts` also has its own `mapToExternalStatus()` and `mapToExternalPriority()` functions. The two sets diverge silently.

**Files:**
- Modify: `app/api/projects/[id]/external-tasks/route.ts`
- Modify: `lib/taskSources/adapters/types.ts` (verify adapter interface exposes mapStatus/mapPriority)

**Step 1: Read `lib/taskSources/adapters/types.ts`**

Confirm `TaskSourceAdapter` has `mapStatus` and `mapPriority` fields. If they are optional (`mapStatus?:`), make them required.

**Step 2: Read `lib/taskSources/adapters/index.ts`**

Confirm all four adapters export a `mapStatus` and `mapPriority`. Each adapter (Jira, GitHub, Monday, DoneDone) already has these; verify they are included in the exported object.

**Step 3: In `external-tasks/route.ts`, delete the two local map functions**

Remove `mapToExternalStatus()` (lines 9–17) and `mapToExternalPriority()` (lines 19–27).

**Step 4: Replace the calls to the deleted functions**

In the `.map((ext): ExternalTask => ...)` block, replace:

```ts
status: mapToExternalStatus(ext.status),
priority: mapToExternalPriority(ext.priority),
```

with adapter-specific mapping via the adapter reference already in scope:

```ts
// adapter was retrieved above: const adapter = getTaskSourceAdapter(cfg.adapter_key)
status: adapter.mapStatus(ext.status) as ExternalTaskStatus,
priority: ext.priority ? (adapter.mapPriority(ext.priority) as ExternalTaskPriority) : null,
```

Note: adapter `mapStatus` returns `TaskStatus` ('idea'|'developing'|'done'|…) while the route returns `ExternalTaskStatus` ('todo'|'inprogress'|'review'|'blocked'|'done'). Either:
- Accept the inconsistency and cast (quick fix), OR
- Rename `ExternalTaskStatus` values to match `TaskStatus` values and update all consumers (thorough fix).

The quick-fix cast is acceptable here; note it as a follow-on.

**Step 5: Run the dev server and load the external tasks panel**

Expected: statuses still map correctly (visually unchanged).

**Step 6: Commit**

```bash
git add app/api/projects/[id]/external-tasks/route.ts lib/taskSources/adapters/types.ts
git commit -m "refactor: remove duplicate mapToExternalStatus/Priority — delegate to adapter"
```

---

## Task 5: Extract a shared SWR fetcher

**Problem:** `const fetcher = (url: string) => fetch(url).then(r => r.json())` is copy-pasted in 5+ components, each potentially handling errors differently.

**Files:**
- Create: `lib/fetcher.ts`
- Modify: `components/layout/Sidebar.tsx`, `app/(dashboard)/projects/[projectId]/inbox/page.tsx`, `components/tasks/ExternalTaskDashboard.tsx`, `app/(dashboard)/projects/[projectId]/agents/page.tsx`, `app/(dashboard)/projects/[projectId]/agents/[agentId]/page.tsx`

**Step 1: Create `lib/fetcher.ts`**

```ts
export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = new Error(`API error ${res.status}: ${res.statusText}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
  return res.json() as Promise<T>
}
```

**Step 2: In each of the 5 files, replace the inline fetcher declaration**

```ts
// Remove this line:
const fetcher = (url: string) => fetch(url).then(r => r.json())

// Add import:
import { fetcher } from '@/lib/fetcher'
```

**Step 3: Update `useSWR` calls to use the generic type**

Where types are known, thread them through: `useSWR<MyResponseType>(url, fetcher)`. This is optional but improves type safety.

**Step 4: Verify the app still loads**

```bash
npm run dev
```

Check each page that fetches data.

**Step 5: Commit**

```bash
git add lib/fetcher.ts components/layout/Sidebar.tsx app/(dashboard)/projects/[projectId]/inbox/page.tsx components/tasks/ExternalTaskDashboard.tsx app/(dashboard)/projects/[projectId]/agents/page.tsx app/(dashboard)/projects/[projectId]/agents/[agentId]/page.tsx
git commit -m "refactor: extract shared SWR fetcher to lib/fetcher.ts"
```

---

## Task 6: Add versioned sessionStorage filter schema

**Problem:** `ExternalTaskDashboard.tsx` reads `sessionStorage` without any schema validation. If the shape changes, deserialization silently produces garbage filter state.

**Files:**
- Modify: `components/tasks/ExternalTaskDashboard.tsx`

**Step 1: Read the sessionStorage read/write logic in `ExternalTaskDashboard.tsx`**

Find the `sessionStorage.getItem('ext-tasks-filters')` and `sessionStorage.setItem(...)` calls (~lines 68–105).

**Step 2: Add a version key to the serialized object**

```ts
const FILTER_STORAGE_VERSION = 1
const FILTER_STORAGE_KEY = 'ext-tasks-filters'

// When writing:
sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
  v: FILTER_STORAGE_VERSION,
  sources: filters.sources,
  statuses: filters.statuses,
  priorities: filters.priorities,
  // … other fields
}))

// When reading:
try {
  const raw = sessionStorage.getItem(FILTER_STORAGE_KEY)
  if (raw) {
    const parsed = JSON.parse(raw)
    if (parsed?.v === FILTER_STORAGE_VERSION) {
      // apply parsed values to state
    } else {
      // stale version — discard silently
      sessionStorage.removeItem(FILTER_STORAGE_KEY)
    }
  }
} catch {
  sessionStorage.removeItem(FILTER_STORAGE_KEY)
}
```

**Step 3: Apply same pattern to the `ext-tasks-groupby` key**

Prefix with `v1:` on write, check prefix on read, discard if missing.

**Step 4: Build to check for type errors**

```bash
npm run build 2>&1 | head -40
```

**Step 5: Commit**

```bash
git add components/tasks/ExternalTaskDashboard.tsx
git commit -m "fix: version sessionStorage filter schema to prevent stale deserialization"
```

---

## Task 7: Fix project name fallback showing adapter key

**Problem:** In `external-tasks/route.ts` line 60, when no project name can be extracted from the task metadata, the code falls back to `cfg.adapter_key` (e.g. `"monday"` or `"github"`). This is confusing in the UI.

**Files:**
- Modify: `app/api/projects/[id]/external-tasks/route.ts`

**Step 1: Read lines 54–63 of the route**

The fallback chain ends in: `?? cfg.adapter_key`

**Step 2: Replace the adapter_key fallback with the human-readable adapter name**

The adapter object has a `.name` property. Since we already have `adapter` in scope (from Task 4), use:

```ts
?? adapter.name,   // e.g. "Monday.com", "GitHub Issues"
```

**Step 3: Verify in the UI**

Load the External Tasks panel. Tasks with no project metadata should now show e.g. "GitHub Issues" instead of "github".

**Step 4: Commit**

```bash
git add app/api/projects/[id]/external-tasks/route.ts
git commit -m "fix: use adapter.name instead of adapter_key as project fallback in external tasks"
```

---

## Task 8: Add jitter to polling interval

**Problem:** All poll timers fire at exactly `60_000` ms from their start time. If multiple sources start at the same time (e.g. after a restart), they all hit their external APIs simultaneously, causing a thundering-herd burst.

**Files:**
- Modify: `lib/taskSources/pollManager.ts`

**Step 1: Read `pollManager.ts`**

The `POLL_INTERVAL_MS = 60_000` constant and `setInterval(..., POLL_INTERVAL_MS)` on line 26/38.

**Step 2: Add a jitter helper**

```ts
/** Returns a value in [base - jitter, base + jitter] */
function withJitter(base: number, jitterMs = 5_000): number {
  return base + Math.floor((Math.random() * 2 - 1) * jitterMs)
}
```

**Step 3: Replace the fixed `setInterval` with a recursive `setTimeout` using jitter**

`setInterval` with a fixed interval cannot vary per-tick. Replace with a self-rescheduling `setTimeout`:

```ts
function scheduleNext(projectId: string, adapterKey: string): void {
  const timers = getTimers()
  const key = timerKey(projectId, adapterKey)
  const timer = setTimeout(async () => {
    try {
      const db = getDb()
      const result = await syncProjectSource(db, projectId, adapterKey)
      if (result.error) {
        logEvent(db, { projectId, type: 'task_sync', summary: `[${adapterKey}] Sync failed: ${result.error}`, severity: 'warn' })
      } else if (result.created > 0 || result.updated > 0 || result.deleted > 0) {
        logEvent(db, { projectId, type: 'task_sync', summary: `[${adapterKey}] Synced: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`, severity: 'info' })
      }
    } catch (err) {
      console.error(`[poll] sync failed for ${projectId}:${adapterKey}:`, err)
    } finally {
      // Only reschedule if we haven't been stopped
      if (timers.has(key)) {
        scheduleNext(projectId, adapterKey)
      }
    }
  }, withJitter(POLL_INTERVAL_MS))
  timers.set(key, timer as unknown as ReturnType<typeof setInterval>)
}
```

Update `startPolling` to call `scheduleNext(projectId, adapterKey)` instead of `setInterval(...)`.

Update `stopPolling` to call `clearTimeout` instead of `clearInterval` (or keep `clearInterval` — it works for `setTimeout` handles in Node too, but `clearTimeout` is semantically correct).

**Step 4: Restart the dev server and confirm polling still fires**

Watch logs for `[poll] started polling for ...` messages and confirm sync events appear in the event log after ~60s.

**Step 5: Commit**

```bash
git add lib/taskSources/pollManager.ts
git commit -m "fix: add ±5s jitter to poll interval to prevent thundering-herd on restart"
```

---

## Task 9: Make GitHub adapter consistent with others on empty resourceIds

**Problem:** `lib/taskSources/adapters/github.ts` throws `Error('No repositories selected')` when `resourceIds` is empty. All other adapters either return `[]` or fetch all available resources. The route wraps this in `Promise.allSettled`, so it shows as an error in the UI rather than an empty state.

**Files:**
- Modify: `lib/taskSources/adapters/github.ts`

**Step 1: Read the `fetchTasks` function in `github.ts`**

Line 53: `if (resourceIds.length === 0) throw new Error('No repositories selected')`

**Step 2: Change the throw to an early return**

```ts
if (resourceIds.length === 0) return []
```

**Step 3: Verify the UI shows empty state instead of an error banner when no repos are selected**

**Step 4: Commit**

```bash
git add lib/taskSources/adapters/github.ts
git commit -m "fix: return empty array instead of throwing when GitHub resourceIds is empty"
```

---

## Task 10: Extract SQL queries into a repository layer

**Problem:** Raw SQL strings are scattered across route files. Multiple routes query the same tables with slight variations. There is no central place to enforce query correctness or add indices.

**Scope:** This task covers `task_source_config` and `tasks` queries only — a full repository extraction for all tables would be too large a change in one task.

**Files:**
- Verify: `lib/db/taskSourceConfig.ts` already exists — check what's there
- Verify: `lib/db/tasks.ts` already exists — check what's there
- Modify: any API route that queries `tasks` or `task_source_config` directly with inline SQL

**Step 1: Read `lib/db/taskSourceConfig.ts` and `lib/db/tasks.ts`**

Identify which queries are already extracted and which routes still use inline SQL for these tables.

**Step 2: Move any inline `tasks` queries from routes to `lib/db/tasks.ts`**

Search for inline SQL:
```bash
grep -rn "FROM tasks\|INTO tasks\|UPDATE tasks" app/api/ --include="*.ts"
```

For each result: extract the query into a named function in `lib/db/tasks.ts` and import it in the route.

**Step 3: Move any inline `task_source_config` queries from routes to `lib/db/taskSourceConfig.ts`**

```bash
grep -rn "FROM task_source_config\|task_source_config" app/api/ --include="*.ts"
```

**Step 4: Verify build passes**

```bash
npm run build 2>&1 | head -40
```

**Step 5: Commit**

```bash
git add lib/db/tasks.ts lib/db/taskSourceConfig.ts app/api/
git commit -m "refactor: move inline tasks/task_source_config SQL into repository functions"
```

---

## Task 11: Add input validation to API routes that mutate data

**Problem:** POST/PATCH/DELETE route handlers accept `request.json()` and use fields directly with no shape validation. Malformed payloads (missing fields, wrong types) can cause confusing DB errors or silent failures.

**Scope:** Cover the four highest-risk routes: task create/update, task source config create/update.

**Files:**
- Modify: `app/api/projects/[id]/tasks/route.ts` (POST)
- Modify: `app/api/projects/[id]/tasks/[taskId]/route.ts` (PATCH, DELETE)
- Modify: `app/api/projects/[id]/task-source-config/route.ts` (POST, PATCH)

**Step 1: Read each route file**

For each, find what fields are read from `await request.json()`.

**Step 2: Add inline type guards — no library needed**

For each route, add a validation block before the DB call:

```ts
const body = await request.json() as unknown

// Example for task create:
if (
  typeof body !== 'object' ||
  body === null ||
  typeof (body as any).title !== 'string' ||
  !(body as any).title.trim()
) {
  return NextResponse.json({ error: 'title is required' }, { status: 400 })
}
const { title, status, priority } = body as { title: string; status?: string; priority?: string }
```

**Step 3: Return 400 for invalid input, not 500**

Ensure each validation failure returns `{ status: 400 }`.

**Step 4: Run the dev server and confirm normal operations still work**

Create a task, edit it, save a task source config.

**Step 5: Commit**

```bash
git add app/api/projects/[id]/tasks/route.ts app/api/projects/[id]/tasks/[taskId]/route.ts app/api/projects/[id]/task-source-config/route.ts
git commit -m "fix: add input validation to task and task-source-config mutation routes"
```

---

## Task 12: Fix Monday.com description column detection

**Problem:** The Monday.com adapter uses a fragile heuristic to find the description column: it finds the first `long_text` or `text` column. Many boards have text columns that are not descriptions (e.g. "Owner", "Link").

**Files:**
- Modify: `lib/taskSources/adapters/monday.ts`

**Step 1: Read `fetchBoardTasks` in `monday.ts` (~lines 286–320)**

Find the description extraction:
```ts
const descriptionCol = item.column_values?.find(
  (cv: any) => cv.type === 'long_text' || cv.type === 'text'
)
```

**Step 2: Prefer columns with title matching /description|notes|details/i before falling back**

In `fetchBoardTasks`, after `columns` is available, find the description column ID once per board:

```ts
const descriptionColumnId = columns.find(
  (col: any) => /description|notes|details/i.test(col.title) && (col.type === 'long_text' || col.type === 'text')
)?.id ?? columns.find(
  (col: any) => col.type === 'long_text'
)?.id ?? null
```

Then per item:
```ts
const description = descriptionColumnId
  ? item.column_values?.find((cv: any) => cv.id === descriptionColumnId)?.text?.trim() || null
  : null
```

**Step 3: Run the dev server and trigger a Monday sync**

Verify description fields populate correctly for boards that have a column titled "Description" or "Notes".

**Step 4: Commit**

```bash
git add lib/taskSources/adapters/monday.ts
git commit -m "fix: prefer title-matched column for Monday.com description extraction"
```

---

## Task 13: Document the three-layer status terminology

**Problem:** There are three separate status enumerations with different values and purposes, and it is easy to confuse them:

- `TaskStatus` (internal tasks): `'idea' | 'speccing' | 'planning' | 'developing' | 'done'`
- `ExternalTaskStatus` (external task display): `'todo' | 'inprogress' | 'review' | 'blocked' | 'done'`
- Raw adapter strings: whatever the upstream system uses (e.g. `"In Progress"`, `"Done"`, `"open"`)

**Files:**
- Modify: `lib/types/externalTask.ts`
- Modify: `lib/db/tasks.ts` (or wherever `TaskStatus` is defined)

**Step 1: Read `lib/types/externalTask.ts` and `lib/db/tasks.ts`**

Find where each type is defined.

**Step 2: Add a JSDoc comment to each type explaining its purpose and the mapping chain**

```ts
/**
 * Status values for external (synced) tasks as displayed in the UI.
 * Mapped from raw adapter strings via each adapter's `mapStatus()` function.
 * Distinct from `TaskStatus` (used for internal project tasks).
 * Raw → ExternalTaskStatus → displayed label in ExternalTaskDashboard.
 */
export type ExternalTaskStatus = 'todo' | 'inprogress' | 'review' | 'blocked' | 'done'
```

```ts
/**
 * Status values for internal project tasks (ideas, specs, plans, dev work).
 * Distinct from `ExternalTaskStatus` (used for tasks synced from external sources).
 */
export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'
```

**Step 3: Commit**

```bash
git add lib/types/externalTask.ts lib/db/tasks.ts
git commit -m "docs: add JSDoc clarifying the three-layer status terminology"
```

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-04-08-technical-debt.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
