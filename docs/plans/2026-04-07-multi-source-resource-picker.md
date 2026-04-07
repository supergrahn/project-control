# Multi-Source External Task Integration with Resource Picker

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow each project to connect to all supported external task sources independently, each with a badge-based resource picker that fetches available boards/repos/projects on credential blur.

**Architecture:** The `task_source_config` table is migrated from one-row-per-project to one-row-per-adapter-per-project. Each adapter gains a `fetchAvailableResources` method used by a new API route. `TaskSourceSettings` is rewritten to show one always-visible card per adapter, with credential fields and an inline badge picker.

**Tech Stack:** Next.js 16, better-sqlite3, React 19, TypeScript, Tailwind CSS v4

---

### Task 1: Migrate DB schema for multi-source support

**Files:**
- Modify: `lib/db.ts` (after line 293, before the task_status_log migration)

**Step 1: Write the migration**

Add this block in `lib/db.ts` immediately after the `CREATE UNIQUE INDEX idx_tasks_source` line (~293):

```typescript
// ── Multi-source migration: recreate task_source_config with composite key ──
try {
  const cols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
  const hasIdColumn = cols.some(c => c.name === 'id')
  if (!hasIdColumn) {
    db.exec(`
      CREATE TABLE task_source_config_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    TEXT NOT NULL,
        adapter_key   TEXT NOT NULL,
        config        TEXT NOT NULL DEFAULT '{}',
        resource_ids  TEXT,
        is_active     INTEGER NOT NULL DEFAULT 1,
        last_synced_at TEXT,
        last_error    TEXT,
        created_at    TEXT NOT NULL,
        UNIQUE(project_id, adapter_key)
      );
      INSERT INTO task_source_config_new
        (project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at)
        SELECT project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at
        FROM task_source_config;
      DROP TABLE task_source_config;
      ALTER TABLE task_source_config_new RENAME TO task_source_config;
    `)
  }
} catch {}
```

**Step 2: Write the test**

Create `tests/lib/taskSourceConfig.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import Database from 'better-sqlite3'
import {
  upsertTaskSourceConfig,
  getTaskSourceConfig,
  listTaskSourceConfigs,
  deleteTaskSourceConfig,
  toggleTaskSourceActive,
  listActiveTaskSources,
} from '@/lib/db/taskSourceConfig'

let db: Database.Database
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'test', path: '/tmp/test' })
})

afterEach(() => db.close())

it('upserts and retrieves a single source config', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['repo1'])
  const cfg = getTaskSourceConfig(db, projectId, 'github')
  expect(cfg?.config.token).toBe('abc')
  expect(cfg?.resource_ids).toEqual(['repo1'])
})

it('allows multiple adapter configs per project', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
  upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'https://x.atlassian.net', email: 'a@b.com', api_token: 'tok' }, [])
  const configs = listTaskSourceConfigs(db, projectId)
  expect(configs).toHaveLength(2)
})

it('updates existing config without creating duplicate', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'v1' }, [])
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'v2' }, ['r1'])
  const configs = listTaskSourceConfigs(db, projectId)
  expect(configs).toHaveLength(1)
  expect(configs[0].config.token).toBe('v2')
  expect(configs[0].resource_ids).toEqual(['r1'])
})

it('deletes a specific adapter config', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
  upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])
  deleteTaskSourceConfig(db, projectId, 'github')
  expect(listTaskSourceConfigs(db, projectId)).toHaveLength(1)
})

it('toggles active state for specific adapter', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
  toggleTaskSourceActive(db, projectId, 'github', false)
  const cfg = getTaskSourceConfig(db, projectId, 'github')
  expect(cfg?.is_active).toBe(0)
})

it('listActiveTaskSources returns only active rows', () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
  upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])
  toggleTaskSourceActive(db, projectId, 'jira', false)
  const active = listActiveTaskSources(db)
  expect(active).toHaveLength(1)
  expect(active[0].adapter_key).toBe('github')
})
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/lib/taskSourceConfig.test.ts
```
Expected: FAIL — functions don't exist yet.

**Step 4: Commit**

```bash
git add lib/db.ts tests/lib/taskSourceConfig.test.ts
git commit -m "feat: migrate task_source_config to multi-source schema"
```

---

### Task 2: Rewrite `lib/db/taskSourceConfig.ts`

**Files:**
- Modify: `lib/db/taskSourceConfig.ts` (rewrite entirely)

**Step 1: Replace the file**

```typescript
import type { Database } from 'better-sqlite3'

export type TaskSourceConfig = {
  id: number
  project_id: string
  adapter_key: string
  config: Record<string, string>
  resource_ids: string[]
  is_active: number
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

type Row = Omit<TaskSourceConfig, 'config' | 'resource_ids'> & {
  config: string
  resource_ids: string | null
}

function parseRow(row: Row): TaskSourceConfig {
  return {
    ...row,
    config: JSON.parse(row.config),
    resource_ids: row.resource_ids ? JSON.parse(row.resource_ids) : [],
  }
}

export function getTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
): TaskSourceConfig | null {
  const row = db
    .prepare('SELECT * FROM task_source_config WHERE project_id = ? AND adapter_key = ?')
    .get(projectId, adapterKey) as Row | undefined
  return row ? parseRow(row) : null
}

export function listTaskSourceConfigs(
  db: Database,
  projectId: string,
): TaskSourceConfig[] {
  const rows = db
    .prepare('SELECT * FROM task_source_config WHERE project_id = ?')
    .all(projectId) as Row[]
  return rows.map(parseRow)
}

export function upsertTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
  config: Record<string, string>,
  resourceIds: string[],
): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(project_id, adapter_key) DO UPDATE SET
      config = excluded.config,
      resource_ids = excluded.resource_ids
  `).run(projectId, adapterKey, JSON.stringify(config), JSON.stringify(resourceIds), now)
}

export function deleteTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
): void {
  db.prepare(
    'DELETE FROM task_source_config WHERE project_id = ? AND adapter_key = ?',
  ).run(projectId, adapterKey)
}

export function toggleTaskSourceActive(
  db: Database,
  projectId: string,
  adapterKey: string,
  isActive: boolean,
): void {
  db.prepare(
    'UPDATE task_source_config SET is_active = ? WHERE project_id = ? AND adapter_key = ?',
  ).run(isActive ? 1 : 0, projectId, adapterKey)
}

export function listActiveTaskSources(db: Database): TaskSourceConfig[] {
  const rows = db
    .prepare('SELECT * FROM task_source_config WHERE is_active = 1')
    .all() as Row[]
  return rows.map(parseRow)
}
```

**Step 2: Run tests**

```bash
npx vitest run tests/lib/taskSourceConfig.test.ts
```
Expected: all PASS.

**Step 3: Commit**

```bash
git add lib/db/taskSourceConfig.ts
git commit -m "feat: update taskSourceConfig CRUD for multi-source support"
```

---

### Task 3: Extend adapter interface

**Files:**
- Modify: `lib/taskSources/adapters/types.ts`

**Step 1: Add two fields to `TaskSourceAdapter`**

Replace the current `TaskSourceAdapter` type:

```typescript
export type AvailableResource = {
  id: string
  name: string
}

export type TaskSourceAdapter = {
  key: string
  name: string
  configFields: ConfigField[]
  resourceSelectionLabel: string
  fetchAvailableResources(config: Record<string, string>): Promise<AvailableResource[]>
  fetchTasks(config: Record<string, string>, resourceIds: string[]): Promise<ExternalTask[]>
  mapStatus(raw: string): TaskStatus
  mapPriority(raw: string | null): TaskPriority
}
```

Note: `fetchTasks` now takes `resourceIds: string[]` as a second argument.

**Step 2: Commit**

```bash
git add lib/taskSources/adapters/types.ts
git commit -m "feat: extend TaskSourceAdapter interface with resource selection"
```

---

### Task 4: Update GitHub adapter

**Files:**
- Modify: `lib/taskSources/adapters/github.ts`

**Step 1: Remove `repos` from configFields**

Change `configFields` to only have the token field:

```typescript
const configFields: ConfigField[] = [
  {
    key: 'token',
    label: 'GitHub Token',
    type: 'password',
    required: true,
    helpText: 'Personal access token with repo scope',
  },
]
```

**Step 2: Add `fetchAvailableResources`**

Add this function above the adapter export:

```typescript
async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { token } = config
  if (!token) return []

  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  })

  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)

  const repos = (await response.json()) as { full_name: string }[]
  return repos.map(r => ({ id: r.full_name, name: r.full_name }))
}
```

**Step 3: Update `fetchTasks` signature and filtering**

Change the function signature and remove the repos config read. Replace the existing repos-based filtering with `resourceIds`:

```typescript
async function fetchTasks(
  config: Record<string, string>,
  resourceIds: string[],
): Promise<ExternalTask[]> {
  const token = config.token

  if (!token) throw new Error('Missing required config: token')
  if (resourceIds.length === 0) throw new Error('No repositories selected')

  const tasks: ExternalTask[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const url = new URL('https://api.github.com/search/issues')
    url.searchParams.set('q', 'is:open is:issue assignee:@me')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as {
      items: Array<{
        id: number
        number: number
        title: string
        body: string | null
        state: string
        html_url: string
        repository_url: string
        labels: Array<{ name: string }>
        assignees: Array<{ login: string }>
      }>
    }

    if (!data.items || data.items.length === 0) {
      hasMore = false
      break
    }

    for (const item of data.items) {
      const repoPath = item.repository_url.split('/').slice(-2).join('/')
      if (!resourceIds.includes(repoPath)) continue

      const priorityLabel = item.labels.find((l: any) =>
        /^priority[:\s-]/i.test(l.name) ||
        ['critical', 'urgent', 'high', 'medium', 'low', 'normal'].includes(l.name.toLowerCase())
      )
      const priority = priorityLabel
        ? priorityLabel.name.toLowerCase().replace(/^priority[:\s-]*/i, '')
        : null

      const labelNames = item.labels.map((l: any) => l.name.toLowerCase())
      const isInProgress = labelNames.some((l: string) => ['in-progress', 'wip', 'in progress'].includes(l))
      const status = item.state === 'closed' ? 'closed' : isInProgress ? 'in-progress' : 'open'

      const sourceId = `${repoPath}#${item.number}`

      tasks.push({
        sourceId,
        title: item.title,
        description: item.body,
        status,
        priority,
        url: item.html_url,
        labels: item.labels.map((l: any) => l.name),
        assignees: item.assignees.map((a: any) => a.login),
        meta: item,
      })
    }

    hasMore = data.items.length === 100
    page++
  }

  return tasks
}
```

**Step 4: Update adapter export**

```typescript
export const githubAdapter: TaskSourceAdapter = {
  key: 'github',
  name: 'GitHub Issues',
  configFields,
  resourceSelectionLabel: 'Select repositories',
  fetchAvailableResources,
  fetchTasks,
  mapStatus,
  mapPriority,
}
```

**Step 5: Commit**

```bash
git add lib/taskSources/adapters/github.ts
git commit -m "feat: add resource picker to GitHub adapter"
```

---

### Task 5: Update monday.com adapter

**Files:**
- Modify: `lib/taskSources/adapters/monday.ts`

**Step 1: Remove `board_ids` from configFields**

Remove the `board_ids` entry from the `configFields` array (lines 102–107). Keep `api_token`, `user_id`, `subdomain`, `status_col_id`, `priority_col_id`.

**Step 2: Add `fetchAvailableResources`**

Add before the adapter export:

```typescript
async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { api_token } = config
  if (!api_token) return []

  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: api_token,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: '{ boards(limit: 100) { id name } }' }),
  })

  if (!response.ok) throw new Error(`Monday.com API error: ${response.status}`)

  const data = (await response.json()) as { data?: { boards?: { id: string; name: string }[] } }
  return (data.data?.boards ?? []).map(b => ({ id: b.id, name: b.name }))
}
```

**Step 3: Update `fetchTasks` signature**

Change the function signature from:
```typescript
async fetchTasks(config: Record<string, string>): Promise<ExternalTask[]>
```
to:
```typescript
async fetchTasks(config: Record<string, string>, resourceIds: string[]): Promise<ExternalTask[]>
```

Replace the `board_ids` extraction inside `fetchTasks`:
```typescript
// Replace this:
const { api_token, board_ids, user_id, subdomain, status_col_id, priority_col_id } = config
if (!api_token || !board_ids || !user_id || !subdomain) { ... }
const boardIdList = board_ids.split(',').map(id => id.trim()).filter(id => id)

// With this:
const { api_token, user_id, subdomain, status_col_id, priority_col_id } = config
if (!api_token || !user_id || !subdomain) {
  throw new Error('Missing required Monday.com configuration: api_token, user_id, subdomain')
}
if (resourceIds.length === 0) throw new Error('No boards selected')
const boardIdList = resourceIds
```

**Step 4: Update adapter export**

Add to the `mondayAdapter` object:
```typescript
resourceSelectionLabel: 'Select boards',
fetchAvailableResources,
```

And update `fetchTasks` to the new signature.

**Step 5: Commit**

```bash
git add lib/taskSources/adapters/monday.ts
git commit -m "feat: add resource picker to monday.com adapter"
```

---

### Task 6: Update Jira adapter

**Files:**
- Modify: `lib/taskSources/adapters/jira.ts`

**Step 1: Remove `jql_filter` from configFields**

Remove the `jql_filter` entry. Keep `base_url`, `email`, `api_token`.

**Step 2: Add `fetchAvailableResources`**

Add before the adapter export:

```typescript
async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { base_url, email, api_token } = config
  if (!base_url || !email || !api_token) return []

  const credentials = Buffer.from(`${email}:${api_token}`).toString('base64')
  const response = await fetch(`${base_url}/rest/api/3/project`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) throw new Error(`Jira API error: ${response.status}`)

  const projects = (await response.json()) as { key: string; name: string }[]
  return projects.map(p => ({ id: p.key, name: p.name }))
}
```

**Step 3: Update `fetchTasks` signature**

Change signature to `fetchTasks(config: Record<string, string>, resourceIds: string[])`.

Replace the JQL logic inside the function:

```typescript
// Replace this:
const jql = jql_filter && jql_filter.trim()
  ? jql_filter.trim()
  : 'assignee = currentUser() AND statusCategory != Done'

// With this:
let jql = 'assignee = currentUser() AND statusCategory != Done'
if (resourceIds.length > 0) {
  const keys = resourceIds.map(k => `"${k}"`).join(', ')
  jql = `project in (${keys}) AND assignee = currentUser() AND statusCategory != Done`
}
```

Also remove `jql_filter` from the destructuring at the top of `fetchTasks`.

**Step 4: Update adapter export**

Add to `jiraAdapter`:
```typescript
resourceSelectionLabel: 'Select projects',
fetchAvailableResources,
```

**Step 5: Commit**

```bash
git add lib/taskSources/adapters/jira.ts
git commit -m "feat: add resource picker to Jira adapter"
```

---

### Task 7: Update DoneDone adapter

**Files:**
- Modify: `lib/taskSources/adapters/donedone.ts`

**Step 1: Add `fetchAvailableResources`**

Add before the adapter export (DoneDone currently has no resource selection field):

```typescript
async function fetchAvailableResources(
  config: Record<string, string>,
): Promise<{ id: string; name: string }[]> {
  const { subdomain, username, api_key } = config
  if (!subdomain || !username || !api_key) return []

  const baseUrl = `https://${subdomain}.mydonedone.com/issuetracker/api/v2`
  const credentials = Buffer.from(`${username}:${api_key}`).toString('base64')

  const response = await fetch(`${baseUrl}/projects.json`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) throw new Error(`DoneDone API error: ${response.status}`)

  const data = (await response.json()) as any
  const projects = Array.isArray(data) ? data : (data.projects ?? [])
  return projects.map((p: any) => ({
    id: String(p.id),
    name: p.name || p.title || String(p.id),
  }))
}
```

**Step 2: Update `fetchTasks` signature**

Change to `fetchTasks(config: Record<string, string>, resourceIds: string[])`.

After fetching all issues, add a filter at the end of the function before the `return`:

```typescript
// Filter by selected projects if any are selected
if (resourceIds.length > 0) {
  return tasks.filter(t => {
    const meta = t.meta as any
    const projectId = String(meta.project_id ?? meta.projectId ?? '')
    return resourceIds.includes(projectId)
  })
}
return tasks
```

**Step 3: Update adapter export**

Add to `donedoneAdapter`:
```typescript
resourceSelectionLabel: 'Select projects',
fetchAvailableResources,
```

**Step 4: Commit**

```bash
git add lib/taskSources/adapters/donedone.ts
git commit -m "feat: add resource picker to DoneDone adapter"
```

---

### Task 8: Update sync service for multi-source

**Files:**
- Modify: `lib/taskSources/syncService.ts`

**Step 1: Update imports and add per-source sync function**

Replace the entire file:

```typescript
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getTaskSourceConfig, listTaskSourceConfigs } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { createTask, updateTask, deleteTask } from '@/lib/db/tasks'
import type { Task } from '@/lib/db/tasks'

export type SyncResult = {
  created: number
  updated: number
  deleted: number
  error?: string
}

export async function syncProjectSource(
  db: Database,
  projectId: string,
  adapterKey: string,
): Promise<SyncResult> {
  const config = getTaskSourceConfig(db, projectId, adapterKey)
  if (!config) throw new Error(`No config for ${adapterKey} on project ${projectId}`)

  const adapter = getTaskSourceAdapter(adapterKey)

  try {
    const externalTasks = await adapter.fetchTasks(config.config, config.resource_ids)

    const existingTasks = db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND source = ?'
    ).all(projectId, adapterKey) as Task[]

    const existingBySourceId = new Map(existingTasks.map(t => [t.source_id, t]))

    let created = 0, updated = 0
    const seenSourceIds = new Set<string>()

    for (const ext of externalTasks) {
      seenSourceIds.add(ext.sourceId)
      const existing = existingBySourceId.get(ext.sourceId)
      const mappedStatus = adapter.mapStatus(ext.status)
      const mappedPriority = adapter.mapPriority(ext.priority)

      if (existing) {
        updateTask(db, existing.id, {
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : null,
          idea_file: ext.description,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
          status: mappedStatus,
        })
        updated++
      } else {
        const task = createTask(db, {
          id: randomUUID(),
          projectId,
          title: ext.title,
          priority: mappedPriority,
          labels: ext.labels.length > 0 ? ext.labels : undefined,
        })
        updateTask(db, task.id, {
          source: adapterKey,
          source_id: ext.sourceId,
          source_url: ext.url,
          source_meta: JSON.stringify(ext.meta),
          idea_file: ext.description,
          status: mappedStatus,
        })
        created++
      }
    }

    let deleted = 0
    for (const existing of existingTasks) {
      if (existing.source_id && !seenSourceIds.has(existing.source_id)) {
        deleteTask(db, existing.id)
        deleted++
      }
    }

    db.prepare(
      'UPDATE task_source_config SET last_synced_at = ?, last_error = NULL WHERE project_id = ? AND adapter_key = ?'
    ).run(new Date().toISOString(), projectId, adapterKey)

    return { created, updated, deleted }
  } catch (err: any) {
    const errorMsg = err?.message || String(err)
    db.prepare(
      'UPDATE task_source_config SET last_error = ? WHERE project_id = ? AND adapter_key = ?'
    ).run(errorMsg, projectId, adapterKey)
    return { created: 0, updated: 0, deleted: 0, error: errorMsg }
  }
}

export async function syncProject(
  db: Database,
  projectId: string,
): Promise<SyncResult[]> {
  const configs = listTaskSourceConfigs(db, projectId)
  return Promise.all(
    configs
      .filter(c => c.is_active)
      .map(c => syncProjectSource(db, projectId, c.adapter_key))
  )
}
```

**Step 2: Commit**

```bash
git add lib/taskSources/syncService.ts
git commit -m "feat: update sync service for multi-source per project"
```

---

### Task 9: Update poll manager for per-adapter timers

**Files:**
- Modify: `lib/taskSources/pollManager.ts`

**Step 1: Replace timer key and update all functions**

Replace the entire file:

```typescript
import { getDb } from '@/lib/db'
import { listActiveTaskSources } from '@/lib/db/taskSourceConfig'
import { syncProjectSource } from '@/lib/taskSources/syncService'
import { logEvent } from '@/lib/events'

const POLL_INTERVAL_MS = 60_000

declare global {
  var pollTimers: Map<string, ReturnType<typeof setInterval>> | undefined
}

function getTimers(): Map<string, ReturnType<typeof setInterval>> {
  if (!globalThis.pollTimers) globalThis.pollTimers = new Map()
  return globalThis.pollTimers
}

function timerKey(projectId: string, adapterKey: string): string {
  return `${projectId}:${adapterKey}`
}

export function startPolling(projectId: string, adapterKey: string): void {
  const timers = getTimers()
  const key = timerKey(projectId, adapterKey)
  if (timers.has(key)) return

  const timer = setInterval(async () => {
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
    }
  }, POLL_INTERVAL_MS)

  timers.set(key, timer)
  console.log(`[poll] started polling for ${projectId}:${adapterKey}`)
}

export function stopPolling(projectId: string, adapterKey: string): void {
  const timers = getTimers()
  const key = timerKey(projectId, adapterKey)
  const timer = timers.get(key)
  if (timer) {
    clearInterval(timer)
    timers.delete(key)
    console.log(`[poll] stopped polling for ${projectId}:${adapterKey}`)
  }
}

export function stopAllPolling(): void {
  const timers = getTimers()
  for (const [key, timer] of timers) {
    clearInterval(timer)
    console.log(`[poll] stopped polling for ${key}`)
  }
  timers.clear()
}

export function startAllPolling(): void {
  try {
    const db = getDb()
    const activeSources = listActiveTaskSources(db)
    for (const source of activeSources) {
      startPolling(source.project_id, source.adapter_key)
    }
    if (activeSources.length > 0) {
      console.log(`[poll] started polling for ${activeSources.length} source(s)`)
    }
  } catch (err) {
    console.error('[poll] failed to start polling:', err)
  }
}
```

**Step 2: Commit**

```bash
git add lib/taskSources/pollManager.ts
git commit -m "feat: update poll manager for per-adapter timer keys"
```

---

### Task 10: Update task-source API routes

**Files:**
- Modify: `app/api/projects/[id]/task-source/route.ts`
- Create: `app/api/projects/[id]/task-source/resources/route.ts`

**Step 1: Replace `route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import {
  getTaskSourceConfig,
  listTaskSourceConfigs,
  upsertTaskSourceConfig,
  deleteTaskSourceConfig,
  toggleTaskSourceActive,
} from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'
import { startPolling, stopPolling } from '@/lib/taskSources/pollManager'

type RouteParams = { params: Promise<{ id: string }> }

// GET: Returns all task source configs for the project (passwords redacted)
export async function GET(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()
  const configs = listTaskSourceConfigs(db, projectId)

  const redacted = configs.map(cfg => {
    const adapter = getTaskSourceAdapter(cfg.adapter_key)
    const redactedConfig = { ...cfg.config }
    for (const field of adapter.configFields) {
      if (field.type === 'password' && redactedConfig[field.key]) {
        redactedConfig[field.key] = '••••••••'
      }
    }
    return { ...cfg, config: redactedConfig }
  })

  return NextResponse.json(redacted)
}

// PUT: Create or update a specific adapter config
export async function PUT(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, config, resourceIds = [] } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  const adapter = getTaskSourceAdapter(adapterKey)
  const db = getDb()
  const existing = getTaskSourceConfig(db, projectId, adapterKey)

  // Strip redacted placeholders
  for (const field of adapter.configFields) {
    if (field.type === 'password' && config[field.key] === '••••••••') {
      config[field.key] = existing?.config[field.key] ?? ''
    }
  }

  // Validate required fields
  for (const field of adapter.configFields) {
    if (field.required && !config[field.key]) {
      return NextResponse.json({ error: `${field.label} is required` }, { status: 400 })
    }
  }

  upsertTaskSourceConfig(db, projectId, adapterKey, config, resourceIds)
  startPolling(projectId, adapterKey)

  return NextResponse.json({ ok: true })
}

// DELETE: Remove a specific adapter config
export async function DELETE(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { searchParams } = new URL(req.url)
  const adapterKey = searchParams.get('adapterKey')
  const deleteTasks = searchParams.get('deleteTasks') === 'true'

  if (!adapterKey) {
    return NextResponse.json({ error: 'adapterKey required' }, { status: 400 })
  }

  const db = getDb()
  stopPolling(projectId, adapterKey)
  deleteTaskSourceConfig(db, projectId, adapterKey)

  if (deleteTasks) {
    db.prepare('DELETE FROM tasks WHERE project_id = ? AND source = ?').run(projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}

// PATCH: Toggle active/inactive for a specific adapter
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const { adapterKey, is_active } = await req.json()

  if (!adapterKey) {
    return NextResponse.json({ error: 'adapterKey required' }, { status: 400 })
  }

  const db = getDb()
  toggleTaskSourceActive(db, projectId, adapterKey, is_active)

  if (is_active) {
    startPolling(projectId, adapterKey)
  } else {
    stopPolling(projectId, adapterKey)
  }

  return NextResponse.json({ ok: true })
}
```

**Step 2: Create resources route**

Create `app/api/projects/[id]/task-source/resources/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

export async function POST(req: Request) {
  const { adapterKey, config } = await req.json()

  if (!adapterKey || !config) {
    return NextResponse.json({ error: 'adapterKey and config required' }, { status: 400 })
  }

  try {
    const adapter = getTaskSourceAdapter(adapterKey)
    const resources = await adapter.fetchAvailableResources(config)
    return NextResponse.json({ resources })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Failed to fetch resources' }, { status: 502 })
  }
}
```

**Step 3: Update `/api/projects/[id]/sync-tasks/route.ts`**

Read the current file and update `syncProject` call to handle the array return:

```typescript
// Replace the syncProject call result handling:
const results = await syncProject(db, projectId)
const totals = results.reduce(
  (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, deleted: acc.deleted + r.deleted }),
  { created: 0, updated: 0, deleted: 0 }
)
return NextResponse.json(totals)
```

**Step 4: Commit**

```bash
git add app/api/projects/[id]/task-source/route.ts app/api/projects/[id]/task-source/resources/route.ts app/api/projects/[id]/sync-tasks/route.ts
git commit -m "feat: update task-source API routes for multi-source support"
```

---

### Task 11: Update `DynamicConfigForm` to support blur callback

**Files:**
- Modify: `components/projects/DynamicConfigForm.tsx`

**Step 1: Add `onFieldBlur` prop**

Add `onFieldBlur?: (values: Record<string, string>) => void` to `DynamicConfigFormProps`.

In each input and textarea, add:
```tsx
onBlur={() => onFieldBlur?.(formValues)}
```

The updated props type:
```typescript
type DynamicConfigFormProps = {
  fields: ConfigField[]
  values: Record<string, string>
  onSubmit: (values: Record<string, string>) => void
  onFieldBlur?: (values: Record<string, string>) => void
  submitLabel?: string
  loading?: boolean
}
```

And in the destructure:
```typescript
export default function DynamicConfigForm({ fields, values, onSubmit, onFieldBlur, submitLabel = 'Save', loading = false }: DynamicConfigFormProps) {
```

Add `onBlur` to the `<input>` and `<textarea>` elements:
```tsx
<input
  ...existing props...
  onBlur={() => onFieldBlur?.(formValues)}
/>
<textarea
  ...existing props...
  onBlur={() => onFieldBlur?.(formValues)}
/>
```

**Step 2: Commit**

```bash
git add components/projects/DynamicConfigForm.tsx
git commit -m "feat: add onFieldBlur callback to DynamicConfigForm"
```

---

### Task 12: Rewrite `TaskSourceSettings`

**Files:**
- Modify: `components/projects/TaskSourceSettings.tsx`

**Step 1: Rewrite the component**

Replace the entire file:

```tsx
'use client'
import { useState, useEffect, useCallback } from 'react'
import DynamicConfigForm from './DynamicConfigForm'

type ConfigField = {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string
}

type AdapterInfo = {
  key: string
  name: string
  configFields: ConfigField[]
  resourceSelectionLabel: string
}

type TaskSourceConfig = {
  id: number
  project_id: string
  adapter_key: string
  config: Record<string, string>
  resource_ids: string[]
  is_active: number
  last_synced_at: string | null
  last_error: string | null
}

type Resource = { id: string; name: string }

type AdapterCardProps = {
  projectId: string
  adapter: AdapterInfo
  config: TaskSourceConfig | null
  onSaved: () => void
}

function AdapterCard({ projectId, adapter, config, onSaved }: AdapterCardProps) {
  const [expanded, setExpanded] = useState(!!config)
  const [editing, setEditing] = useState(!config)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; deleted: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [deleteTasksOnRemove, setDeleteTasksOnRemove] = useState(false)

  // Resource picker state
  const [resources, setResources] = useState<Resource[]>([])
  const [loadingResources, setLoadingResources] = useState(false)
  const [resourceError, setResourceError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>(config?.resource_ids ?? [])

  const fetchResources = useCallback(async (formValues: Record<string, string>) => {
    const hasRequired = adapter.configFields
      .filter(f => f.required)
      .every(f => formValues[f.key] && formValues[f.key] !== '••••••••')
    if (!hasRequired) return

    setLoadingResources(true)
    setResourceError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-source/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key, config: formValues }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResourceError(data.error ?? 'Failed to fetch resources')
      } else {
        setResources(data.resources)
      }
    } catch {
      setResourceError('Failed to fetch resources')
    } finally {
      setLoadingResources(false)
    }
  }, [adapter, projectId])

  function toggleResource(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSave(values: Record<string, string>) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-source`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key, config: values, resourceIds: selectedIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save')
        return
      }
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/sync-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterKey: adapter.key }),
      })
      setSyncResult(await res.json())
      onSaved()
    } finally {
      setSyncing(false)
    }
  }

  async function handleToggle() {
    if (!config) return
    await fetch(`/api/projects/${projectId}/task-source`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adapterKey: adapter.key, is_active: !config.is_active }),
    })
    onSaved()
  }

  async function handleRemove() {
    const qs = `?adapterKey=${adapter.key}${deleteTasksOnRemove ? '&deleteTasks=true' : ''}`
    await fetch(`/api/projects/${projectId}/task-source${qs}`, { method: 'DELETE' })
    setShowRemoveConfirm(false)
    setExpanded(false)
    setEditing(false)
    onSaved()
  }

  if (!expanded) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-text-secondary text-[13px]">{adapter.name}</span>
        <button
          onClick={() => { setExpanded(true); setEditing(true) }}
          className="text-accent-blue text-[12px] cursor-pointer bg-none border-none p-0"
        >
          Set up
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 border-t border-border-default first:border-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-text-secondary text-[13px] font-semibold">{adapter.name}</span>
        {config && (
          <span className={`text-[11px] px-2 py-0.5 rounded-[4px] ${
            config.is_active
              ? 'bg-accent-green/15 text-status-success'
              : 'bg-accent-orange/15 text-status-warning'
          }`}>
            {config.is_active ? 'Active' : 'Paused'}
          </span>
        )}
        {config?.last_error && (
          <span className="text-[11px] px-2 py-0.5 rounded-[4px] bg-accent-red/15 text-status-error">Error</span>
        )}
        {!config && (
          <button
            onClick={() => { setExpanded(false); setEditing(false) }}
            className="ml-auto text-text-muted text-[12px] cursor-pointer bg-none border-none p-0"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Config form (editing mode) */}
      {(editing || !config) && (
        <>
          {error && (
            <div className="text-status-error text-[12px] mb-3 px-3 py-2 bg-border-default rounded-[6px]">
              {error}
            </div>
          )}
          <DynamicConfigForm
            fields={adapter.configFields}
            values={config?.config ?? {}}
            onSubmit={handleSave}
            onFieldBlur={fetchResources}
            loading={saving}
          />

          {/* Resource picker */}
          {(resources.length > 0 || loadingResources || resourceError) && (
            <div className="mt-4">
              <div className="text-text-secondary text-[12px] font-semibold mb-2">
                {adapter.resourceSelectionLabel}
              </div>
              {loadingResources && (
                <div className="text-text-muted text-[12px]">Loading...</div>
              )}
              {resourceError && (
                <div className="text-status-error text-[12px]">{resourceError}</div>
              )}
              {!loadingResources && resources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {resources.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleResource(r.id)}
                      className={`px-2.5 py-1 rounded-[4px] text-[12px] border cursor-pointer transition-colors ${
                        selectedIds.includes(r.id)
                          ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/30'
                          : 'bg-bg-secondary text-text-secondary border-border-default'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {config && (
            <button
              onClick={() => setEditing(false)}
              className="bg-none border-none text-text-muted cursor-pointer text-[12px] mt-3 p-0"
            >
              Cancel
            </button>
          )}
        </>
      )}

      {/* Configured view (not editing) */}
      {config && !editing && (
        <>
          {config.last_synced_at && (
            <div className="text-text-muted text-[12px] mb-2">
              Last synced: {new Date(config.last_synced_at).toLocaleString()}
            </div>
          )}
          {config.last_error && (
            <div className="text-status-warning text-[12px] mb-3 px-3 py-2 bg-border-default rounded-[6px]">
              {config.last_error}
            </div>
          )}
          {syncResult && (
            <div className="text-status-success text-[12px] mb-3">
              Synced: {syncResult.created} created, {syncResult.updated} updated, {syncResult.deleted} deleted
            </div>
          )}

          {/* Selected resources display */}
          {config.resource_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {config.resource_ids.map(id => (
                <span key={id} className="px-2.5 py-1 rounded-[4px] text-[12px] bg-accent-blue/15 text-accent-blue border border-accent-blue/30">
                  {id}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-3">
            <button onClick={handleSync} disabled={syncing} className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer disabled:cursor-not-allowed">
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button onClick={handleToggle} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              {config.is_active ? 'Pause' : 'Resume'}
            </button>
            <button onClick={() => setEditing(true)} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              Edit
            </button>
            <button onClick={() => setShowRemoveConfirm(true)} className="bg-bg-secondary text-status-error border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
              Remove
            </button>
          </div>

          {showRemoveConfirm && (
            <div className="p-4 bg-border-default rounded-[6px] mt-2">
              <div className="text-text-primary text-[13px] mb-3">Remove {adapter.name}?</div>
              <label className="flex items-center gap-2 text-text-secondary text-[12px] mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteTasksOnRemove}
                  onChange={e => setDeleteTasksOnRemove(e.target.checked)}
                />
                Also delete synced tasks
              </label>
              <div className="flex gap-2">
                <button onClick={handleRemove} className="bg-accent-red/15 text-status-error border border-accent-red/15 rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
                  Confirm Remove
                </button>
                <button onClick={() => setShowRemoveConfirm(false)} className="bg-bg-secondary text-text-secondary border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function TaskSourceSettings({ projectId }: { projectId: string }) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([])
  const [configs, setConfigs] = useState<TaskSourceConfig[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [adaptersData, configsData] = await Promise.all([
      fetch('/api/task-sources').then(r => r.json()),
      fetch(`/api/projects/${projectId}/task-source`).then(r => r.ok ? r.json() : []),
    ])
    setAdapters(adaptersData)
    setConfigs(configsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [projectId])

  if (loading) return <div className="text-text-muted text-[13px]">Loading...</div>

  return (
    <div>
      <div className="text-text-secondary text-[13px] font-semibold mb-3">External Task Sources</div>
      <div className="flex flex-col">
        {adapters.map(adapter => (
          <AdapterCard
            key={adapter.key}
            projectId={projectId}
            adapter={adapter}
            config={configs.find(c => c.adapter_key === adapter.key) ?? null}
            onSaved={load}
          />
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Update `/api/task-sources/route.ts` to include `resourceSelectionLabel`**

Read `app/api/task-sources/route.ts` and ensure it returns `resourceSelectionLabel` from each adapter in the response. If it maps adapter properties explicitly, add `resourceSelectionLabel: adapter.resourceSelectionLabel` to the mapped object.

**Step 3: Update `sync-tasks` route to handle adapterKey**

In `app/api/projects/[id]/sync-tasks/route.ts`, read the request body and if `adapterKey` is provided, call `syncProjectSource` instead of `syncProject`:

```typescript
const body = await req.json().catch(() => ({}))
const db = getDb()

if (body.adapterKey) {
  const result = await syncProjectSource(db, projectId, body.adapterKey)
  return NextResponse.json(result)
} else {
  const results = await syncProject(db, projectId)
  const totals = results.reduce(
    (acc, r) => ({ created: acc.created + r.created, updated: acc.updated + r.updated, deleted: acc.deleted + r.deleted }),
    { created: 0, updated: 0, deleted: 0 }
  )
  return NextResponse.json(totals)
}
```

**Step 4: Commit**

```bash
git add components/projects/TaskSourceSettings.tsx app/api/task-sources/route.ts app/api/projects/[id]/sync-tasks/route.ts
git commit -m "feat: rewrite TaskSourceSettings for multi-source with resource badge picker"
```

---

### Task 13: Run full test suite and verify

**Step 1: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass.

**Step 2: Start dev server and manually verify**

```bash
npm run dev
```

- Open a project's settings page
- Confirm all 4 adapters are visible
- Set up one adapter — enter credentials, blur a field, verify badges appear
- Select some badges, save — verify selected resources show in the configured view
- Set up a second adapter on the same project — verify both show independently

**Step 3: Final commit if anything was fixed**

```bash
git add -A
git commit -m "fix: post-integration fixes"
```
