# Reliability Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close six reliability gaps: silent mutation failures, no fetch retry/timeout, non-atomic sync, non-atomic task creation, orphaned session processes on shutdown, and scattered domain types.

**Architecture:** Each task is self-contained. Tasks 1–2 add new helpers; Tasks 3–5 modify existing files; Task 6 moves types and updates imports. No new dependencies.

**Tech Stack:** TypeScript, React hooks, better-sqlite3 (synchronous transactions), vitest

---

### Task 1: `useMutation` hook — toast on error

**Files:**
- Create: `hooks/useMutation.ts`
- Modify: `components/tasks/CreateTaskModal.tsx`
- Modify: `components/tasks/PropertiesPanel.tsx`
- Test: `tests/hooks/useMutation.test.ts`

The `useToast` hook lives in `components/ui/feedback/Toast.tsx` and returns a `(opts: { message, variant, duration? }) => void` function. All mutations in `CreateTaskModal` and `PropertiesPanel` currently swallow errors with `catch { /* ignore */ }`.

**Step 1: Write the failing test**

Create `tests/hooks/useMutation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMutation } from '@/hooks/useMutation'

// Mock the toast context
const mockToast = vi.fn()
vi.mock('@/components/ui/feedback/Toast', () => ({
  useToast: () => mockToast,
}))

describe('useMutation', () => {
  it('returns result on success', async () => {
    const { result } = renderHook(() => useMutation())
    const value = await act(() => result.current(() => Promise.resolve(42)))
    expect(value).toBe(42)
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('shows error toast and returns undefined on failure', async () => {
    const { result } = renderHook(() => useMutation())
    const value = await act(() =>
      result.current(() => Promise.reject(new Error('oops')), 'Update failed')
    )
    expect(value).toBeUndefined()
    expect(mockToast).toHaveBeenCalledWith({
      message: 'Update failed',
      variant: 'error',
    })
  })

  it('uses default message when none provided', async () => {
    const { result } = renderHook(() => useMutation())
    await act(() => result.current(() => Promise.reject(new Error())))
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something went wrong' })
    )
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hooks/useMutation.test.ts
```
Expected: FAIL — "Cannot find module '@/hooks/useMutation'"

**Step 3: Create `hooks/useMutation.ts`**

```ts
'use client'
import { useToast } from '@/components/ui/feedback/Toast'

export function useMutation() {
  const toast = useToast()

  return async function mutate<T>(
    fn: () => Promise<T>,
    errorMessage?: string,
  ): Promise<T | undefined> {
    try {
      return await fn()
    } catch {
      toast({ message: errorMessage ?? 'Something went wrong', variant: 'error' })
      return undefined
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hooks/useMutation.test.ts
```
Expected: PASS

**Step 5: Update `components/tasks/CreateTaskModal.tsx`**

Replace the two catch blocks (lines 63–76 and 78–100). Import the hook at the top after the existing import:

Replace:
```ts
import { createTask } from '@/hooks/useTasks'
```
With:
```ts
import { createTask } from '@/hooks/useTasks'
import { useMutation } from '@/hooks/useMutation'
```

Inside the component function, add after the existing state declarations:
```ts
const mutate = useMutation()
```

Replace `handleSave` (lines 63–76):
```ts
async function handleSave() {
  if (!title.trim() || loading) return
  setLoading(true)
  await mutate(
    () => createTask(projectId, title.trim(), description.trim() || undefined, {
      priority, labels: labels.length ? labels : undefined,
      assignee_agent_id: assigneeAgentId,
    }).then(t => { onCreated(); onClose(); return t }),
    'Failed to create task',
  )
  setLoading(false)
}
```

Replace `handleStartNow` (lines 78–100):
```ts
async function handleStartNow() {
  if (!title.trim() || loading || hasProviders === false) return
  setLoading(true)
  await mutate(async () => {
    const task = await createTask(projectId, title.trim(), description.trim() || undefined, {
      priority, labels: labels.length ? labels : undefined,
      assignee_agent_id: assigneeAgentId,
    })
    const r = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, phase: 'brainstorm', taskId: task.id }),
    })
    if (!r.ok) {
      const err = await r.json()
      if (err.code !== 'concurrent_session') throw new Error(err.error ?? 'Failed to start session')
    }
    onNavigate(task.id)
    onClose()
  }, 'Failed to start task')
  setLoading(false)
}
```

**Step 6: Update `components/tasks/PropertiesPanel.tsx`**

Add import after existing imports:
```ts
import { useMutation } from '@/hooks/useMutation'
```

Inside component, after the `agents` state declaration:
```ts
const mutate = useMutation()
```

Replace the three one-liner handlers (lines 40–41, 44–45, 73–74):
```ts
const handleStatusChange = (value: string) =>
  mutate(() => patchTask(task.id, { status: value as Task['status'] }), 'Failed to update status')

const handlePriorityClick = (p: string) =>
  mutate(() => patchTask(task.id, { priority: p as Task['priority'] }), 'Failed to update priority')

const handleAssigneeChange = (value: string) =>
  mutate(() => patchTask(task.id, { assignee_agent_id: value || null }), 'Failed to update assignee')
```

The `handleLabelKeyDown` and `handleLabelRemove` handlers already have optimistic revert logic — keep them but add toast on failure:

Replace `handleLabelKeyDown` (lines 48–61):
```ts
const handleLabelKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return
  const input = e.currentTarget
  const value = input.value.trim()
  if (!value) return
  const updated = [...labels, value]
  setLabels(updated)
  input.value = ''
  const result = await mutate(() => patchTask(task.id, { labels: updated }), 'Failed to add label')
  if (result === undefined) setLabels(labels)
}
```

Replace `handleLabelRemove` (lines 63–71):
```ts
const handleLabelRemove = async (index: number) => {
  const updated = labels.filter((_, i) => i !== index)
  setLabels(updated)
  const result = await mutate(() => patchTask(task.id, { labels: updated }), 'Failed to remove label')
  if (result === undefined) setLabels(labels)
}
```

**Step 7: Commit**

```bash
git add hooks/useMutation.ts tests/hooks/useMutation.test.ts components/tasks/CreateTaskModal.tsx components/tasks/PropertiesPanel.tsx
git commit -m "feat: add useMutation hook with toast on error, apply to task components"
```

---

### Task 2: `fetchWithRetry` — timeout + backoff for adapter fetch calls

**Files:**
- Modify: `lib/fetcher.ts`
- Modify: `lib/taskSources/adapters/github.ts`
- Test: `tests/lib/fetchWithRetry.test.ts`

All adapter `fetch()` calls (GitHub has 3 in github.ts) need timeout + retry. Add `fetchWithRetry` to the existing `lib/fetcher.ts`.

**Step 1: Write the failing test**

Create `tests/lib/fetchWithRetry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from '@/lib/fetcher'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns response on first success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and returns on subsequent success', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValue(new Response('ok', { status: 200 }))
    )
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 3, timeoutMs: 10_000 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting retries on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 2, timeoutMs: 10_000 })
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('HTTP 500')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws timeout error when request takes too long', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    }))
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 1, timeoutMs: 5000 })
    await vi.advanceTimersByTimeAsync(5001)
    await expect(promise).rejects.toThrow('timed out')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/fetchWithRetry.test.ts
```
Expected: FAIL — "fetchWithRetry is not exported from '@/lib/fetcher'"

**Step 3: Add `fetchWithRetry` to `lib/fetcher.ts`**

Append to the existing file (keep the existing `fetcher` function unchanged):

```ts
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  { retries = 3, timeoutMs = 10_000 }: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...options, signal: controller.signal })
      // Return immediately for 2xx and 4xx — client errors won't self-heal
      if (res.ok || (res.status >= 400 && res.status < 500)) return res
      lastError = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastError = (err as Error).name === 'AbortError'
        ? new Error(`Request timed out after ${timeoutMs}ms`)
        : (err as Error)
    } finally {
      clearTimeout(timeoutId)
    }

    if (attempt < retries - 1) {
      await new Promise<void>(r => setTimeout(r, 1000 * 2 ** attempt))
    }
  }

  throw lastError
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/fetchWithRetry.test.ts
```
Expected: PASS

**Step 5: Update `lib/taskSources/adapters/github.ts`**

Add import at the top (after existing imports):
```ts
import { fetchWithRetry } from '@/lib/fetcher'
```

Replace all three `fetch(` calls in the file with `fetchWithRetry(`. The signature is identical — just swap the function name. There are three occurrences:
1. `fetchAvailableResources` — line ~25: `const response = await fetch(`
2. `fetchTasks` pagination — line ~65: `const response = await fetch(`
3. Comment fetching — line ~140: `const response = await fetch(`

Run `grep -n "await fetch(" lib/taskSources/adapters/github.ts` to confirm all three locations before editing.

**Step 6: Run adapter tests**

```bash
npx vitest run tests/lib/adapters/github.test.ts
```
Expected: PASS (tests mock `fetch` globally — `fetchWithRetry` calls `fetch` internally so mocks still work)

**Step 7: Commit**

```bash
git add lib/fetcher.ts lib/taskSources/adapters/github.ts tests/lib/fetchWithRetry.test.ts
git commit -m "feat: add fetchWithRetry with 10s timeout and exponential backoff, apply to GitHub adapter"
```

---

### Task 3: Atomic sync — wrap syncService writes in a transaction

**Files:**
- Modify: `lib/taskSources/syncService.ts`
- Test: `tests/lib/syncService.test.ts` (extend existing)

The async `adapter.fetchTasks()` call must stay outside the transaction (better-sqlite3 transactions are synchronous). Everything after it can be wrapped.

**Step 1: Add a failing test to existing `tests/lib/syncService.test.ts`**

Add this test inside the `describe('syncProjectSource')` block:

```ts
it('rolls back all task changes if an error occurs mid-sync', async () => {
  upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

  const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
  vi.mocked(getTaskSourceAdapter).mockReturnValue({
    key: 'github',
    name: 'GitHub',
    configFields: [],
    resourceSelectionLabel: 'Select',
    fetchAvailableResources: async () => [],
    fetchTasks: async () => [
      { sourceId: 'r1', title: 'Task 1', description: null, status: 'open', priority: null, url: 'u1', labels: [], assignees: [], meta: {} },
      { sourceId: 'r2', title: 'Task 2', description: null, status: 'open', priority: null, url: 'u2', labels: [], assignees: [], meta: {} },
    ],
    mapStatus: () => 'idea' as const,
    mapPriority: () => 'medium' as const,
  })

  // First sync succeeds - creates 2 tasks
  await syncProjectSource(db, projectId, 'github')
  const before = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND is_deleted = 0').get(projectId) as { n: number }
  expect(before.n).toBe(2)

  // Now break the DB mid-transaction by making updateTask throw on second call
  const original = db.prepare.bind(db)
  let callCount = 0
  vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
    if (sql.includes('UPDATE tasks SET') && ++callCount === 2) {
      throw new Error('simulated DB error')
    }
    return original(sql)
  })

  await syncProjectSource(db, projectId, 'github')

  // All tasks should still be visible — partial update rolled back
  const after = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND is_deleted = 0').get(projectId) as { n: number }
  expect(after.n).toBe(2)
})
```

**Step 2: Run to verify it fails (or is inconclusive without the transaction)**

```bash
npx vitest run tests/lib/syncService.test.ts
```
Expected: The new test may pass or fail non-deterministically — without a transaction, partial state is committed.

**Step 3: Wrap the sync body in `lib/taskSources/syncService.ts`**

The full current try block in `syncProjectSource` (lines 25–148) has this shape:
```ts
try {
  const externalTasks = await adapter.fetchTasks(...)
  // ... all DB writes ...
  return { created, updated, deleted }
} catch (err) { ... }
```

Restructure to pull the DB writes into a transaction. The `async` fetch stays outside:

```ts
try {
  const externalTasks = await adapter.fetchTasks(config.config, config.resource_ids)

  const { created, updated, deleted } = db.transaction(() => {
    const existingTasks = db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND source = ? AND (is_deleted = 0 OR is_deleted IS NULL)'
    ).all(projectId, adapterKey) as Task[]

    const existingBySourceId = new Map(existingTasks.map(t => [t.source_id, t]))

    let created = 0, updated = 0
    const seenSourceIds = new Set<string>()
    const now = new Date().toISOString()

    for (const ext of externalTasks) {
      // ... same loop body as before (createTask, updateTask calls) ...
    }

    let deleted = 0
    const incomingIds = Array.from(seenSourceIds)

    if (incomingIds.length === 0) {
      const result = db.prepare(
        `UPDATE tasks SET is_deleted = 1, updated_at = ? WHERE project_id = ? AND source = ? AND is_deleted = 0`
      ).run(now, projectId, adapterKey)
      deleted = result.changes
    } else {
      const placeholders = incomingIds.map(() => '?').join(', ')
      const deleteResult = db.prepare(`
        UPDATE tasks SET is_deleted = 1, updated_at = ?
        WHERE project_id = ? AND source = ? AND source_id NOT IN (${placeholders}) AND is_deleted = 0
      `).run(now, projectId, adapterKey, ...incomingIds)
      deleted = deleteResult.changes
    }

    // Comments upsert (already had its own transaction — now it's part of the outer one)
    const insertComment = db.prepare(`
      INSERT INTO task_comments
        (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source, task_source_id, comment_id) DO UPDATE SET
        author    = excluded.author,
        body      = excluded.body,
        synced_at = excluded.synced_at
    `)
    for (const ext of externalTasks) {
      for (const comment of ext.comments ?? []) {
        insertComment.run(
          randomUUID(), projectId, adapterKey, ext.sourceId,
          comment.id, comment.author ?? '', comment.body ?? '',
          comment.createdAt, now,
        )
      }
    }

    db.prepare(
      'UPDATE task_source_config SET last_synced_at = ?, last_error = NULL WHERE project_id = ? AND adapter_key = ?'
    ).run(new Date().toISOString(), projectId, adapterKey)

    return { created, updated, deleted }
  })()

  return { created, updated, deleted }
} catch (err: any) {
  const errorMsg = err?.message || String(err)
  db.prepare(
    'UPDATE task_source_config SET last_error = ? WHERE project_id = ? AND adapter_key = ?'
  ).run(errorMsg, projectId, adapterKey)
  return { created: 0, updated: 0, deleted: 0, error: errorMsg }
}
```

Note: The inner `insertAllComments` transaction wrapping is now redundant since it's inside the outer `db.transaction()`. Remove the `insertAllComments` wrapper and inline the loop directly.

**Step 4: Run all sync tests**

```bash
npx vitest run tests/lib/syncService.test.ts
```
Expected: All PASS including the new transaction test

**Step 5: Commit**

```bash
git add lib/taskSources/syncService.ts tests/lib/syncService.test.ts
git commit -m "feat: wrap sync DB writes in transaction for atomicity"
```

---

### Task 4: Atomic task creation — merge createTask+updateTask and add deleteTaskSourceWithTasks

**Files:**
- Modify: `lib/db/tasks.ts`
- Modify: `lib/db/taskSourceConfig.ts`
- Modify: `app/api/tasks/route.ts`
- Modify: `app/api/projects/[id]/task-source/route.ts`
- Test: `tests/lib/db/tasks.test.ts` (create)

**Step 1: Write failing tests**

Create `tests/lib/db/tasks.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initDb, createProject } from '@/lib/db'
import { createTask, getTask } from '@/lib/db/tasks'
import { deleteTaskSourceWithTasks, upsertTaskSourceConfig } from '@/lib/db/taskSourceConfig'

let db: Database.Database
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'test', path: '/tmp/test' })
})

afterEach(() => db.close())

describe('createTask', () => {
  it('creates task with notes in a single atomic operation', () => {
    const task = createTask(db, {
      id: 'task-1',
      projectId,
      title: 'My task',
      notes: 'Some notes here',
    })
    expect(task.notes).toBe('Some notes here')
    // Verify it's persisted correctly
    expect(getTask(db, 'task-1')?.notes).toBe('Some notes here')
  })

  it('creates task without notes when notes is omitted', () => {
    const task = createTask(db, { id: 'task-2', projectId, title: 'No notes' })
    expect(task.notes).toBeNull()
  })
})

describe('deleteTaskSourceWithTasks', () => {
  it('deletes source config and all tasks atomically', () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'x' }, [])
    // Insert a task manually linked to this source
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, priority, source, created_at, updated_at)
       VALUES ('t1', ?, 'Task', 'idea', 'medium', 'github', datetime('now'), datetime('now'))`
    ).run(projectId)

    deleteTaskSourceWithTasks(db, projectId, 'github')

    const config = db.prepare('SELECT * FROM task_source_config WHERE project_id = ? AND adapter_key = ?').get(projectId, 'github')
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? AND source = ?').all(projectId, 'github')
    expect(config).toBeUndefined()
    expect(tasks).toHaveLength(0)
  })
})
```

**Step 2: Run to verify it fails**

```bash
npx vitest run tests/lib/db/tasks.test.ts
```
Expected: FAIL — `createTask` doesn't accept `notes`, `deleteTaskSourceWithTasks` not exported from `taskSourceConfig`

**Step 3: Update `lib/db/tasks.ts`**

Add `notes` to `CreateTaskInput` type (after `assignee_agent_id`):
```ts
export type CreateTaskInput = {
  id: string
  projectId: string
  title: string
  priority?: TaskPriority
  labels?: string[]
  assignee_agent_id?: string | null
  notes?: string
}
```

Wrap `createTask` body in `db.transaction()`:
```ts
export function createTask(db: Database, input: CreateTaskInput): Task {
  return db.transaction(() => {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO tasks (id, project_id, title, status, priority, labels, assignee_agent_id, created_at, updated_at)
      VALUES (?, ?, ?, 'idea', ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.projectId,
      input.title,
      input.priority ?? 'medium',
      input.labels ? JSON.stringify(input.labels) : null,
      input.assignee_agent_id ?? null,
      now,
      now,
    )
    if (input.notes) {
      db.prepare('UPDATE tasks SET notes = ? WHERE id = ?').run(input.notes, input.id)
    }
    return getTask(db, input.id)!
  })()
}
```

**Step 4: Add `deleteTaskSourceWithTasks` to `lib/db/taskSourceConfig.ts`**

Append after `deleteTaskSourceConfig`:
```ts
export function deleteTaskSourceWithTasks(
  db: Database,
  projectId: string,
  adapterKey: string,
): void {
  db.transaction(() => {
    db.prepare(
      'DELETE FROM task_source_config WHERE project_id = ? AND adapter_key = ?'
    ).run(projectId, adapterKey)
    db.prepare(
      'DELETE FROM tasks WHERE project_id = ? AND source = ?'
    ).run(projectId, adapterKey)
  })()
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/lib/db/tasks.test.ts
```
Expected: PASS

**Step 6: Update `app/api/tasks/route.ts` POST handler**

Replace the two-step create+update (lines 36–46) with a single `createTask` call:
```ts
const task = createTask(db, {
  id: randomUUID(),
  projectId,
  title: title.trim(),
  priority: priority ?? undefined,
  labels: Array.isArray(labels) ? labels : undefined,
  assignee_agent_id: assignee_agent_id ?? undefined,
  notes: notes?.trim() || undefined,
})
return NextResponse.json(task, { status: 201 })
```

Remove the `updateTask` import from this file if it's no longer used. Check: `import { createTask, getTasksByProject, updateTask } from '@/lib/db/tasks'` — remove `updateTask` if unused.

**Step 7: Update `app/api/projects/[id]/task-source/route.ts` DELETE handler**

Add `deleteTaskSourceWithTasks` to the import:
```ts
import {
  getTaskSourceConfig,
  listTaskSourceConfigs,
  upsertTaskSourceConfig,
  deleteTaskSourceConfig,
  deleteTaskSourceWithTasks,
  toggleTaskSourceActive,
} from '@/lib/db/taskSourceConfig'
```

Replace lines 97–103:
```ts
stopPolling(projectId, adapterKey)
if (deleteTasks) {
  deleteTaskSourceWithTasks(db, projectId, adapterKey)
} else {
  deleteTaskSourceConfig(db, projectId, adapterKey)
}
```

Remove the `deleteTasksBySource` import from `@/lib/db/tasks` if it's no longer used in this file.

**Step 8: Run full test suite**

```bash
npx vitest run
```
Expected: All existing tests pass

**Step 9: Commit**

```bash
git add lib/db/tasks.ts lib/db/taskSourceConfig.ts app/api/tasks/route.ts "app/api/projects/[id]/task-source/route.ts" tests/lib/db/tasks.test.ts
git commit -m "feat: atomic task creation with notes, atomic task-source deletion"
```

---

### Task 5: Session process lifecycle — SIGTERM/exit handlers

**Files:**
- Modify: `lib/session-manager.ts`

No unit test is practical for signal handlers. Verification is by code inspection.

**Step 1: Add shutdown handler to `lib/session-manager.ts`**

After the existing globalThis map initialisations (after line 35, before the `projectEmitters` block), add:

```ts
declare global {
  var shutdownRegistered: boolean | undefined
}

if (!globalThis.shutdownRegistered) {
  globalThis.shutdownRegistered = true
  const killAllProcesses = () => {
    for (const proc of globalThis.procMap.values()) {
      try { proc.kill() } catch { /* already dead */ }
    }
  }
  process.on('SIGTERM', () => { killAllProcesses(); process.exit(0) })
  process.on('exit', killAllProcesses)
}
```

The `globalThis.shutdownRegistered` guard prevents duplicate handler registration across Next.js hot reloads (the module re-evaluates on each reload but `globalThis` persists).

`process.on('exit')` fires synchronously — `proc.kill()` is sync so it works. `SIGTERM` calls `process.exit(0)` explicitly since the default SIGTERM handler wouldn't fire the `exit` event.

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors

**Step 3: Commit**

```bash
git add lib/session-manager.ts
git commit -m "feat: kill child processes on SIGTERM/exit to prevent orphaned sessions"
```

---

### Task 6: Type consolidation — move TaskStatus/TaskPriority to `lib/types/`

**Files:**
- Modify: `lib/types/externalTask.ts` → rename/extend to `lib/types/index.ts`
- Modify: `lib/db/tasks.ts`
- Modify: all files importing `TaskStatus` or `TaskPriority` from `@/lib/db/tasks`

**Step 1: Find all import sites**

```bash
grep -rn "from '@/lib/db/tasks'" --include="*.ts" --include="*.tsx" .
```

Note every file that imports `TaskStatus` or `TaskPriority`. These need updating. Files that only import `Task`, `UpdateTaskInput`, `CreateTaskInput` etc. can stay unchanged since those types remain in `lib/db/tasks.ts`.

**Step 2: Create `lib/types/index.ts`**

```ts
// External task types (synced from third-party sources)
export type { ExternalTaskSource, ExternalTaskStatus, ExternalTaskPriority, ExternalTask } from './externalTask'

/**
 * Status values for internal project tasks (ideas, specs, plans, dev work).
 * Distinct from `ExternalTaskStatus` (used for tasks synced from external sources).
 *
 * Mapping chain: raw adapter string → adapter.mapStatus() → ExternalTaskStatus → UI label
 * Internal status transitions: idea → speccing → planning → developing → done
 */
export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
```

**Step 3: Write a compile-time test**

Create `tests/lib/types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { TaskStatus, TaskPriority } from '@/lib/types'
import type { ExternalTaskStatus } from '@/lib/types'

describe('type exports from lib/types', () => {
  it('TaskStatus is a string union', () => {
    expectTypeOf<TaskStatus>().toEqualTypeOf<'idea' | 'speccing' | 'planning' | 'developing' | 'done'>()
  })
  it('TaskPriority is a string union', () => {
    expectTypeOf<TaskPriority>().toEqualTypeOf<'low' | 'medium' | 'high' | 'urgent'>()
  })
  it('ExternalTaskStatus is accessible from lib/types', () => {
    expectTypeOf<ExternalTaskStatus>().toEqualTypeOf<'todo' | 'inprogress' | 'review' | 'blocked' | 'done'>()
  })
})
```

**Step 4: Run to verify it passes (types already exported)**

```bash
npx vitest run tests/lib/types.test.ts
```
Expected: PASS

**Step 5: Update `lib/db/tasks.ts` — remove definitions, add re-exports**

Remove these two lines:
```ts
export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
```

Add at the top of the file (after the import for Database):
```ts
export type { TaskStatus, TaskPriority } from '@/lib/types'
```

Also update the JSDoc comment on the `Task` type's `status` field to reference `@/lib/types` if it mentions the old location.

**Step 6: Update adapter import sites**

The adapter files import from `@/lib/db/tasks`. Since we re-export from there, these still work — but update them to import from `@/lib/types` directly:

Run the grep from Step 1 and for each file that imports `TaskStatus` or `TaskPriority`, change:
```ts
import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'
```
to:
```ts
import type { TaskStatus, TaskPriority } from '@/lib/types'
```

Files that import other things from `@/lib/db/tasks` (like `Task`) keep that import and add a separate `@/lib/types` import if needed.

**Step 7: Verify full TypeScript compile**

```bash
npx tsc --noEmit
```
Expected: No errors

**Step 8: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass

**Step 9: Commit**

```bash
git add lib/types/index.ts lib/db/tasks.ts tests/lib/types.test.ts
git add lib/taskSources/adapters/  # adapter files updated
git commit -m "refactor: consolidate TaskStatus/TaskPriority into lib/types, re-export from lib/db/tasks"
```
