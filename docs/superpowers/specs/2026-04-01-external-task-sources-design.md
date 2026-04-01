# External Task Sources — Design Spec

**Goal:** Allow each project to optionally connect to an external task tracker (Jira, Monday.com, DoneDone, GitHub Issues), sync tasks into the existing `tasks` table, and use them in sessions just like manually created tasks.

**Principles:**
- Per-project configuration — credentials, service type, and filters are all scoped to the project
- Adapter pattern — each service is a self-contained adapter that declares its config schema and implements fetch + normalize
- Dynamic UI — the settings form renders from the adapter's config field declarations; no frontend changes to add a new service
- Mirror the source — sync overwrites source-managed fields; deleted tasks are removed
- Polymorphic task fields — `idea_file`, `spec_file`, `plan_file` can hold either a file path or inline text

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
  mapStatus(raw: string): TaskStatus
  mapPriority(raw: string | null): TaskPriority
}
```

The registry at `lib/taskSources/adapters/index.ts` exports:
- `getTaskSourceAdapter(key: string): TaskSourceAdapter`
- `listTaskSourceAdapters(): TaskSourceAdapter[]` — used by the UI to show available services

### Adapter implementations

Four adapters, ported from task-dashboard's proven logic:

**Jira** (`lib/taskSources/adapters/jira.ts`)
- Config fields: `base_url` (text, required), `email` (text, required), `api_token` (password, required), `jql_filter` (textarea, optional — defaults to `assignee = currentUser() AND statusCategory != Done`)
- Uses REST API v3 `/rest/api/3/search/jql`
- Parses Atlassian Document Format (ADF) descriptions to plain text via `extractAdfText()`
- Status mapping: `statusCategory.key` of `done` → done, `indeterminate` + review/retest/qa keywords → review, `indeterminate` → inprogress, else → todo
- Priority mapping: highest/critical → critical, high → high, medium → medium, low/lowest → low

**GitHub Issues** (`lib/taskSources/adapters/github.ts`)
- Config fields: `token` (password, required), `repos` (text, required, placeholder: `owner/repo, owner/repo2`)
- Uses Search API `GET /search/issues?q=is:open+is:issue+assignee:@me`
- Post-filters to configured repos
- Status from labels (blocked, review, in progress, etc.) and state (closed → done)
- Priority from labels (critical, high, medium, low)

**Monday.com** (`lib/taskSources/adapters/monday.ts`)
- Config fields: `api_token` (password, required), `board_ids` (text, required, placeholder: `123456, 789012`), `user_id` (text, required), `subdomain` (text, required), `status_col_id` (text, optional), `priority_col_id` (text, optional)
- Uses GraphQL API v2024-10
- Filters by people column matching `user_id`
- Auto-detects status/priority columns if IDs not provided
- Status/priority mapping via keyword matching (supports Norwegian)

**DoneDone** (`lib/taskSources/adapters/donedone.ts`)
- Config fields: `subdomain` (text, required), `username` (text, required), `api_key` (password, required)
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

### Polymorphic task fields

No schema change needed. `idea_file`, `spec_file`, `plan_file` already store `TEXT`. The convention:
- If the value starts with `/` or `./`, treat it as a file path → read file contents
- Otherwise, treat it as inline text content

The `buildTaskContext()` function in `lib/prompts.ts` is updated to handle both:

```typescript
function readFieldContent(value: string | null): string | null {
  if (!value) return null
  if (value.startsWith('/') || value.startsWith('./')) {
    try { return readFileSync(value, 'utf8') } catch { return null }
  }
  return value  // inline text
}
```

### Status mapping

External task statuses need to map to project-control's `TaskStatus`:
- `todo` → `idea`
- `inprogress` → `developing`
- `review` → `developing` (closest match)
- `blocked` → `idea` (needs attention, hasn't progressed)
- `done` → `done`

This mapping is applied by the sync service after the adapter's `mapStatus()` normalizes the raw source status.

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
   - If no matching row: INSERT with `status` mapped from source, `idea_file` set to `description`, `labels` from source
   - If matching row exists: UPDATE `title`, `status`, `priority`, `labels`, `idea_file` (description), `source_url`, `source_meta`. Do NOT overwrite `spec_file`, `plan_file`, `dev_summary`, `notes`, `session_log`, `assignee_agent_id`, `provider_id` — these are local-only fields that the user may have set.

3. **Delete logic** — tasks in DB with matching `(project_id, source)` whose `source_id` is not in the fetched set are deleted.

### Background polling

`lib/taskSources/pollManager.ts` — manages 1-minute interval polling.

- On app start, reads all active `task_source_config` rows and starts a `setInterval` per project
- `startPolling(projectId)` / `stopPolling(projectId)` — called when config is created/deleted/toggled
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
Returns the project's current task source config (or 404 if none configured).

### `PUT /api/projects/[projectId]/task-source`
Body: `{ adapterKey: string, config: Record<string, string> }`
Creates or updates the task source config. Validates required fields against the adapter's `configFields`. Starts polling if `is_active`.

### `DELETE /api/projects/[projectId]/task-source`
Removes the task source config. Stops polling. Does NOT delete synced tasks (they remain as orphaned records until manually cleaned or next sync would have removed them anyway).

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
   - "Remove" button → calls `DELETE .../task-source` with confirmation

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

The existing task detail page works unchanged. `buildTaskContext()` handles polymorphic fields transparently — whether `idea_file` is a path or inline text from Jira, the session prompt gets the content.

### Prompt building

`buildTaskContext()` in `lib/prompts.ts` is updated to use the `readFieldContent()` helper. For external tasks, the description flows into `idea_file` as text, and the agent receives it as `## Idea\n<description>` in its system prompt — same as if it were a file.

---

## 8. File Structure

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
| `lib/db.ts` | Add `task_source_config` table migration, add `source`/`source_id`/`source_url`/`source_meta` columns to tasks, add unique index |
| `lib/db/tasks.ts` | Add `source`, `source_id`, `source_url`, `source_meta` to `Task` type and `UpdateTaskInput` |
| `lib/prompts.ts` | Update `buildTaskContext()` to handle polymorphic fields (file path or inline text) |
| `server.ts` | Start poll manager on app boot (call `startAllPolling()`) |
| `app/(dashboard)/projects/[projectId]/settings/page.tsx` | Add `TaskSourceSettings` component to the page |

### Test files

| File | Coverage |
|------|----------|
| `lib/__tests__/adapters-jira.test.ts` | Jira: fetchTasks mock, mapStatus, mapPriority, ADF extraction |
| `lib/__tests__/adapters-github.test.ts` | GitHub: fetchTasks mock, mapStatus, mapPriority, repo filtering |
| `lib/__tests__/adapters-monday.test.ts` | Monday: fetchTasks mock, mapStatus, mapPriority, people parsing |
| `lib/__tests__/adapters-donedone.test.ts` | DoneDone: fetchTasks mock, mapStatus, mapPriority, fallback endpoint |
| `lib/__tests__/syncService.test.ts` | Upsert, delete, error handling, field mapping |
| `lib/__tests__/taskSourceConfig.test.ts` | CRUD operations |
| `lib/__tests__/buildTaskContext.test.ts` | Polymorphic field reading (path vs inline text) |
| `components/__tests__/DynamicConfigForm.test.tsx` | Form rendering from schema, validation |
| `components/__tests__/TaskSourceSettings.test.tsx` | Config flow: select service, fill form, save, sync, remove |

---

## 9. Data Flow

```
User configures source in project settings
  → PUT /api/projects/:id/task-source
    → upsertTaskSourceConfig()
    → pollManager.startPolling(projectId)

Every 60 seconds (or on-demand):
  → syncProject(db, projectId)
    → getTaskSourceConfig() → adapter config
    → adapter.fetchTasks(config) → ExternalTask[]
    → for each: adapter.mapStatus() → TaskStatus
    → for each: adapter.mapPriority() → TaskPriority
    → upsert into tasks table (source-managed fields only)
    → delete tasks not in fetched set
    → update last_synced_at

User opens task in UI:
  → task has source='jira', idea_file='<description text>'
  → launches session
    → buildTaskContext() reads idea_file as inline text
    → agent receives full task context in prompt
```
