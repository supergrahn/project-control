# External Task Sources — Design Spec

**Goal:** Allow each project to optionally connect to an external task tracker (Jira, Monday.com, DoneDone, GitHub Issues), sync tasks into the existing `tasks` table, and use them in sessions just like manually created tasks.

**Principles:**
- Per-project configuration — credentials, service type, and filters are all scoped to the project
- Adapter pattern — each service is a self-contained adapter that declares its config schema and implements fetch + normalize
- Dynamic UI — the settings form renders from the adapter's config field declarations; no frontend changes to add a new service
- Mirror the source — sync overwrites source-managed fields; deleted tasks are removed
- Polymorphic task fields — `idea_file`, `spec_file`, `plan_file` can hold either a `file://` prefixed path or inline text

---

## 1. Adapter Contract

Each adapter lives in `lib/taskSources/adapters/<service>.ts` and exports an object conforming to `TaskSourceAdapter`.

```typescript
// lib/taskSources/adapters/types.ts

export type ConfigField = {
  key: string               // storage key in task_source_config table
  label: string             // display label in settings form
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string         // optional hint shown below the field
}

export type ExternalTask = {
  sourceId: string          // unique ID in the external system
  title: string
  description: string | null
  status: string            // raw status string from source
  priority: string | null   // raw priority string from source
  url: string               // link back to the source
  labels: string[]
  assignees: string[]
  meta: Record<string, unknown>  // raw source data preserved as JSON
}

export type TaskSourceAdapter = {
  key: string               // 'jira' | 'github' | 'monday' | 'donedone'
  name: string              // 'Jira' | 'GitHub Issues' | 'Monday.com' | 'DoneDone'
  configFields: ConfigField[]
  fetchTasks(config: Record<string, string>): Promise<ExternalTask[]>
  mapStatus(raw: string): TaskStatus      // maps directly to project-control's TaskStatus
  mapPriority(raw: string | null): TaskPriority  // maps directly to project-control's TaskPriority
}
```

### Status mapping

Adapters map directly to project-control's `TaskStatus` (`'idea' | 'speccing' | 'planning' | 'developing' | 'done'`). There is no intermediate type. Each adapter maps its source-specific statuses:

| Source status concept | project-control `TaskStatus` |
|---|---|
| Open / To Do / New | `idea` |
| In Progress / Active | `developing` |
| In Review / Testing / QA | `developing` |
| Blocked / Waiting | `idea` |
| Done / Closed / Resolved | `done` |

### Priority mapping

Adapters map directly to project-control's `TaskPriority` (`'low' | 'medium' | 'high' | 'urgent'`). The task-dashboard uses `'critical'` where project-control uses `'urgent'` — adapters map accordingly:

| Source priority | project-control `TaskPriority` |
|---|---|
| Critical / Highest / Urgent | `urgent` |
| High | `high` |
| Medium / Normal | `medium` |
| Low / Lowest | `low` |

The registry at `lib/taskSources/adapters/index.ts` exports:
- `getTaskSourceAdapter(key: string): TaskSourceAdapter`
- `listTaskSourceAdapters(): TaskSourceAdapter[]` — used by the UI to show available services

### Adapter implementations

Four adapters, ported from task-dashboard's proven fetch/normalize logic with mapping adjusted to project-control's types:

**Jira** (`lib/taskSources/adapters/jira.ts`)
- Config fields: `base_url` (text, required), `email` (text, required), `api_token` (password, required), `jql_filter` (textarea, optional, helpText: `Defaults to: assignee = currentUser() AND statusCategory != Done`)
- Uses REST API v3 `/rest/api/3/search/jql`
- Parses Atlassian Document Format (ADF) descriptions to plain text via `extractAdfText()`
- The `jql_filter` config field is a new enhancement over task-dashboard (which hardcodes the JQL). If empty, uses the same default JQL as task-dashboard.
- Status mapping: `statusCategory.key` of `done` → `done`, `indeterminate` → `developing`, else → `idea`
- Priority mapping: highest/critical → `urgent`, high → `high`, medium → `medium`, low/lowest → `low`

**GitHub Issues** (`lib/taskSources/adapters/github.ts`)
- Config fields: `token` (password, required), `repos` (text, required, placeholder: `owner/repo, owner/repo2`)
- Uses Search API `GET /search/issues?q=is:open+is:issue+assignee:@me`, paginated (100 per page)
- Post-filters to configured repos
- Status: closed → `done`, labels with in-progress/wip → `developing`, else → `idea`
- Priority from labels: critical/urgent → `urgent`, high → `high`, medium/normal → `medium`, low → `low`

**Monday.com** (`lib/taskSources/adapters/monday.ts`)
- Config fields: `api_token` (password, required), `board_ids` (text, required, placeholder: `123456, 789012`), `user_id` (text, required), `subdomain` (text, required), `status_col_id` (text, optional, helpText: `Auto-detects if empty`), `priority_col_id` (text, optional, helpText: `Auto-detects if empty`)
- Uses GraphQL API v2024-10 with `items_page(limit: 100)` per board
- Filters by people column matching `user_id`
- Auto-detects status/priority columns if IDs not provided
- Status/priority mapping via keyword matching (supports Norwegian: ferdig, aktiv, venter, kritisk, høy, middels, lav)

**DoneDone** (`lib/taskSources/adapters/donedone.ts`)
- Config fields: `subdomain` (text, required), `username` (text, required, helpText: `Your DoneDone username, not email`), `api_key` (password, required)
- Uses REST API v2 `/issuetracker/api/v2/issues/all_yours.json` with fallback to `/all_active.json`
- Status/priority mapping via keyword matching

---

## 2. Database Schema Changes

### New table: `task_source_config`

Stores per-project external task source configuration. One row per project (a project can have at most one external source).

```sql
CREATE TABLE IF NOT EXISTS task_source_config (
  project_id   TEXT PRIMARY KEY REFERENCES projects(id),
  adapter_key  TEXT NOT NULL,              -- 'jira' | 'github' | 'monday' | 'donedone'
  config       TEXT NOT NULL DEFAULT '{}', -- JSON object of adapter-specific config values
  is_active    INTEGER NOT NULL DEFAULT 1, -- 0 = paused, 1 = active
  last_synced_at TEXT,                     -- ISO timestamp of last successful sync
  last_error     TEXT,                     -- last sync error message, null if clean
  created_at   TEXT NOT NULL
)
```

**Note:** Credentials are stored as plaintext JSON in the `config` column. This is acceptable for a local-only dashboard that is not exposed to the internet. The settings UI redacts password fields on read (same pattern as task-dashboard's `/api/settings`).

### Extend `tasks` table

Add columns to track external source origin:

```sql
ALTER TABLE tasks ADD COLUMN source TEXT;          -- null for internal, 'jira'/'github'/etc
ALTER TABLE tasks ADD COLUMN source_id TEXT;        -- external system's ID for this task
ALTER TABLE tasks ADD COLUMN source_url TEXT;        -- link back to the external system
ALTER TABLE tasks ADD COLUMN source_meta TEXT;       -- JSON: raw source data
```

A unique constraint on `(project_id, source, source_id)` prevents duplicate synced tasks.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source ON tasks(project_id, source, source_id) WHERE source IS NOT NULL;
```

### Extend `UpdateTaskInput` and `updateTask()`

The existing `UpdateTaskInput` type in `lib/db/tasks.ts` must be extended with:
- `title?: string` — sync needs to update titles when they change in the source
- `status?: TaskStatus` — sync needs to set status freely (including backward transitions)
- `source?: string | null`
- `source_id?: string | null`
- `source_url?: string | null`
- `source_meta?: string | null`

The `updateTask()` function must add corresponding `if ('field' in input)` handlers for each new field.

Additionally, add a `setTaskStatus(db, id, status: TaskStatus)` function that sets status directly without the forward-only constraint of `advanceTaskStatus()`. The sync service uses `setTaskStatus()` instead of `advanceTaskStatus()` because external sources frequently move tasks backward (e.g., reopening a done ticket).

### Polymorphic task fields

No schema change needed. `idea_file`, `spec_file`, `plan_file` already store `TEXT`. The convention uses an explicit `file://` prefix to distinguish file paths from inline text:

- `file:///absolute/path/to/idea.md` → file path, read contents
- Anything else → inline text content

This avoids ambiguity with text that happens to start with `/` (e.g., `/cc @team`).

The `buildTaskContext()` function in `lib/prompts.ts` is updated:

```typescript
function readFieldContent(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('file://')) {
    try { return readFileSync(value.slice(7), 'utf8') } catch { return null }
  }
  return value  // inline text
}
```

Existing file-path values in the database must be migrated to use the `file://` prefix. A one-time migration in `lib/db.ts` handles this:

```typescript
// Migrate existing file paths to file:// prefix
try {
  for (const col of ['idea_file', 'spec_file', 'plan_file']) {
    db.exec(`UPDATE tasks SET ${col} = 'file://' || ${col} WHERE ${col} IS NOT NULL AND ${col} NOT LIKE 'file://%'`)
  }
} catch {}
```

---

## 3. Sync Service

`lib/taskSources/syncService.ts` — the single module that bridges adapters and the database.

### Responsibilities

1. **`syncProject(db, projectId)`** — the main entry point
   - Reads `task_source_config` for the project
   - Calls `adapter.fetchTasks(config)`
   - Upserts tasks into the `tasks` table by `(project_id, source, source_id)`
   - Deletes tasks that exist in DB but were not returned by the adapter (mirror behavior)
   - Updates `last_synced_at` on success, `last_error` on failure
   - Returns `{ created: number, updated: number, deleted: number }`

2. **Upsert logic** — for each external task:
   - If no matching row: INSERT with `status` from `adapter.mapStatus()`, `priority` from `adapter.mapPriority()`, `idea_file` set to description text, `labels` from source
   - If matching row exists: UPDATE `title`, `status` (via `setTaskStatus`), `priority`, `labels`, `idea_file` (description), `source_url`, `source_meta`. Do NOT overwrite `spec_file`, `plan_file`, `dev_summary`, `notes`, `session_log`, `assignee_agent_id`, `provider_id` — these are local-only fields that the user may have set.

3. **Delete logic** — tasks in DB with matching `(project_id, source)` whose `source_id` is not in the fetched set are deleted.

### Background polling

`lib/taskSources/pollManager.ts` — manages 1-minute interval polling.

- On app start, reads all active `task_source_config` rows and starts a `setInterval` per project
- `startPolling(projectId)` / `stopPolling(projectId)` — called when config is created/deleted/toggled
- `stopAllPolling()` — called on shutdown to clear all timers
- Uses `globalThis.pollTimers` map (survives Next.js hot-reload, same pattern as `procMap`)
- Each tick calls `syncProject()` and logs the result to the events table
- On sync error, records the error in `task_source_config.last_error` but continues polling

### On-demand sync

An API route `POST /api/projects/[projectId]/sync-tasks` triggers `syncProject()` immediately and returns the result. The UI calls this when the user clicks "Sync Now".

---

## 4. CRUD Module

`lib/db/taskSourceConfig.ts` — CRUD for the `task_source_config` table.

```typescript
export function getTaskSourceConfig(db, projectId): TaskSourceConfig | null
export function upsertTaskSourceConfig(db, projectId, adapterKey, config): void
export function deleteTaskSourceConfig(db, projectId): void
export function toggleTaskSourceActive(db, projectId, isActive: boolean): void
export function listActiveTaskSources(db): TaskSourceConfig[]
```

Type:
```typescript
type TaskSourceConfig = {
  project_id: string
  adapter_key: string
  config: Record<string, string>  // parsed from JSON
  is_active: number
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}
```

---

## 5. API Routes

### `GET /api/task-sources`
Returns the list of available adapters with their `key`, `name`, and `configFields`. Used by the settings UI to render the service picker and dynamic form.

### `GET /api/projects/[projectId]/task-source`
Returns the project's current task source config (or 404 if none configured). Password fields in `config` are redacted to `••••••••`.

### `PUT /api/projects/[projectId]/task-source`
Body: `{ adapterKey: string, config: Record<string, string> }`
Creates or updates the task source config. Validates required fields against the adapter's `configFields`. Strips redacted placeholder values to avoid overwriting existing credentials. Starts polling if `is_active`.

### `DELETE /api/projects/[projectId]/task-source`
Query param: `?deleteTasks=true` (optional, default false)
Removes the task source config. Stops polling. If `deleteTasks=true`, also deletes all synced tasks for this project (where `source IS NOT NULL`). The UI shows a confirmation dialog with a checkbox: "Also delete synced tasks".

### `POST /api/projects/[projectId]/sync-tasks`
Triggers an immediate sync. Returns `{ created, updated, deleted, error? }`.

### `PATCH /api/projects/[projectId]/task-source`
Body: `{ is_active: boolean }`
Toggles polling on/off without removing the config.

---

## 6. Settings UI

### Location

A new section within the project settings page at `/app/(dashboard)/projects/[projectId]/settings/`. The component is `components/projects/TaskSourceSettings.tsx`.

### Behavior

1. **No source configured:** Shows a dropdown/card picker of available services (from `GET /api/task-sources`). User picks one.

2. **Service selected:** The component renders a form dynamically from the adapter's `configFields` array:
   - `type: 'text'` → text input
   - `type: 'password'` → password input with show/hide toggle
   - `type: 'textarea'` → textarea
   - `required` fields get validation
   - `placeholder` and `helpText` rendered as hints

3. **Source configured:** Shows:
   - Service name and status badge (active/paused/error)
   - Last synced timestamp
   - Last error message (if any), styled as a warning
   - "Sync Now" button → calls `POST .../sync-tasks`
   - "Pause" / "Resume" toggle → calls `PATCH .../task-source`
   - "Edit Configuration" → expands the config form pre-filled with current values (passwords redacted)
   - "Remove" button → calls `DELETE .../task-source` with confirmation dialog (includes "Also delete synced tasks" checkbox)

### Dynamic form component

`components/projects/DynamicConfigForm.tsx` — a reusable component that takes `ConfigField[]` and renders the form. This is the key to the "add a new adapter with zero frontend changes" requirement. The form component knows nothing about Jira or GitHub — it just renders fields from the schema.

---

## 7. Task Display Changes

### Task list / cards

Tasks with a `source` value show:
- A small source icon/badge (Jira, GitHub, etc.) next to the title
- The `source_url` as a clickable external link
- Synced fields are visually distinguished (e.g., slightly dimmed edit controls) to signal they'll be overwritten on next sync

### Task detail view

The existing task detail page works unchanged. `buildTaskContext()` handles polymorphic fields transparently — whether `idea_file` is inline text from Jira or a `file://` path, the session prompt gets the content.

### Prompt building

`buildTaskContext()` in `lib/prompts.ts` is updated to use the `readFieldContent()` helper. For external tasks, the description flows into `idea_file` as text, and the agent receives it as `## Idea\n<description>` in its system prompt — same as if it were a file.

---

## 8. Startup and Shutdown

### Startup (`server.ts`)

After the existing server setup, call `startAllPolling()` from `pollManager.ts`. This reads all active `task_source_config` rows and starts a 60-second interval for each.

### Shutdown (`server.ts`)

The existing shutdown handler is extended to call `stopAllPolling()` before `process.exit(0)`, clearing all interval timers.

```typescript
const shutdown = () => {
  stopAllPolling()
  for (const proc of procMap.values()) {
    try { proc.kill() } catch {}
  }
  process.exit(0)
}
```

---

## 9. File Structure

### Created

| File | Responsibility |
|------|----------------|
| `lib/taskSources/adapters/types.ts` | `ConfigField`, `ExternalTask`, `TaskSourceAdapter` types |
| `lib/taskSources/adapters/index.ts` | Adapter registry: `getTaskSourceAdapter()`, `listTaskSourceAdapters()` |
| `lib/taskSources/adapters/jira.ts` | Jira adapter |
| `lib/taskSources/adapters/github.ts` | GitHub Issues adapter |
| `lib/taskSources/adapters/monday.ts` | Monday.com adapter |
| `lib/taskSources/adapters/donedone.ts` | DoneDone adapter |
| `lib/taskSources/syncService.ts` | `syncProject()` — fetch, upsert, delete, error handling |
| `lib/taskSources/pollManager.ts` | Background 1-minute interval polling per project |
| `lib/db/taskSourceConfig.ts` | CRUD for `task_source_config` table |
| `components/projects/TaskSourceSettings.tsx` | Settings UI for configuring external source |
| `components/projects/DynamicConfigForm.tsx` | Renders form from `ConfigField[]` array |
| `app/api/task-sources/route.ts` | GET: list available adapters |
| `app/api/projects/[projectId]/task-source/route.ts` | GET, PUT, DELETE, PATCH: per-project config |
| `app/api/projects/[projectId]/sync-tasks/route.ts` | POST: trigger immediate sync |

### Modified

| File | Change |
|------|--------|
| `lib/db.ts` | Add `task_source_config` table migration, add `source`/`source_id`/`source_url`/`source_meta` columns to tasks, add unique index, migrate existing file paths to `file://` prefix |
| `lib/db/tasks.ts` | Add `source`, `source_id`, `source_url`, `source_meta` to `Task` type, add `title`/`status`/source fields to `UpdateTaskInput`, add `setTaskStatus()` function |
| `lib/prompts.ts` | Update `buildTaskContext()` to handle polymorphic fields (`file://` prefix vs inline text) |
| `server.ts` | Start poll manager on boot, stop on shutdown |
| `app/(dashboard)/projects/[projectId]/settings/page.tsx` | Add `TaskSourceSettings` component to the page |

### Test files

| File | Coverage |
|------|----------|
| `lib/taskSources/__tests__/jira.test.ts` | Jira: fetchTasks mock, mapStatus, mapPriority, ADF extraction, custom JQL |
| `lib/taskSources/__tests__/github.test.ts` | GitHub: fetchTasks mock, mapStatus, mapPriority, repo filtering, pagination |
| `lib/taskSources/__tests__/monday.test.ts` | Monday: fetchTasks mock, mapStatus, mapPriority, people parsing |
| `lib/taskSources/__tests__/donedone.test.ts` | DoneDone: fetchTasks mock, mapStatus, mapPriority, fallback endpoint |
| `lib/taskSources/__tests__/syncService.test.ts` | Upsert, delete, error handling, field mapping, backward status transitions |
| `lib/__tests__/taskSourceConfig.test.ts` | CRUD operations |
| `lib/__tests__/buildTaskContext.test.ts` | Polymorphic field reading (`file://` path vs inline text) |
| `components/__tests__/DynamicConfigForm.test.tsx` | Form rendering from schema, validation |
| `components/__tests__/TaskSourceSettings.test.tsx` | Config flow: select service, fill form, save, sync, remove |

---

## 10. Data Flow

```
User configures source in project settings
  → PUT /api/projects/:id/task-source
    → upsertTaskSourceConfig()
    → pollManager.startPolling(projectId)

Every 60 seconds (or on-demand):
  → syncProject(db, projectId)
    → getTaskSourceConfig() → adapter config
    → adapter.fetchTasks(config) → ExternalTask[]
    → for each: adapter.mapStatus(raw) → TaskStatus (directly)
    → for each: adapter.mapPriority(raw) → TaskPriority (directly)
    → upsert into tasks table (source-managed fields only)
    → delete tasks not in fetched set
    → update last_synced_at

User opens task in UI:
  → task has source='jira', idea_file='<description text>'
  → launches session
    → buildTaskContext() reads idea_file as inline text
    → agent receives full task context in prompt
```
