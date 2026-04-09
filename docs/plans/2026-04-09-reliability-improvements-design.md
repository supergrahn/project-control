# Reliability Improvements Design

**Date:** 2026-04-09

## Overview

Six targeted improvements to address reliability and correctness gaps identified after the technical debt remediation pass. No new features — each change closes a specific failure mode.

---

## 1. Silent mutation failures → toast on error

**Problem:** ~6 try/catch blocks in components (`CreateTaskModal`, `PropertiesPanel`, `TaskDetailView`) silently swallow API errors with `catch { /* ignore */ }`. Users see no feedback when mutations fail.

**Design:** Add a `useMutation` hook in `hooks/useMutation.ts` that wraps any async call, catches errors, and shows a toast. Signature:

```ts
function useMutation<T>(
  fn: () => Promise<T>,
  options?: { errorMessage?: string }
): { trigger: () => Promise<T | undefined>; loading: boolean }
```

All call sites replace `try { await X } catch { }` with `const { trigger } = useMutation(() => X, { errorMessage: '...' })`. Re-throws after toasting so callers can still react if needed.

---

## 2. Retry + timeout on external API calls

**Problem:** Adapter `fetch()` calls have no timeout and no retry. A slow or dead endpoint hangs the sync indefinitely. 5xx errors fail immediately with no backoff.

**Design:** Add `fetchWithRetry(url, options)` to `lib/fetcher.ts` (server-safe, not client-only):

- `AbortController` timeout: 10s per attempt
- 3 attempts max
- Exponential backoff: 1s → 2s → 4s between retries
- Retry only on 5xx or network errors; 4xx fails immediately (won't self-heal)

All adapter `fetch()` calls replaced with `fetchWithRetry()`. Works in both Node.js and browser since `AbortController` is available in both.

---

## 3. Atomic sync transactions

**Problem:** `syncService.ts` performs creates, updates, soft-deletes, and comment upserts as ~80 separate SQLite writes with no transaction. A crash mid-sync leaves partial state.

**Design:** Wrap the entire DB write phase in a single `db.transaction()`. Shape:

```ts
const externalTasks = await adapter.fetchTasks(...)  // async: outside transaction
db.transaction(() => {
  // all createTask, updateTask, soft-delete, comment upsert calls
})()
```

The async fetch stays outside (better-sqlite3 transactions are synchronous). Also wrap the two-step `createTask` + `updateTask` in the POST `/api/tasks` route in a transaction.

---

## 4. Transaction safety in `lib/db/` functions

**Problem:** Multi-step DB operations at API boundaries run without atomicity:
- POST `/api/tasks`: `createTask()` + `updateTask()` are two separate writes
- DELETE `/api/projects/[id]/task-source`: `deleteTaskSourceConfig()` + `deleteTasksBySource()` are two separate writes

**Design:** Move transaction wrapping into `lib/db/` functions rather than adding a new service layer:

- `createTask()` absorbs the optional `updateTask()` fields so the two-step becomes one transactional call
- Add `deleteTaskSourceWithTasks(db, projectId, adapterKey)` to `lib/db/taskSourceConfig.ts` wrapping both deletes atomically
- Routes call these functions; no raw `db.prepare()` in route handlers

---

## 5. Session process lifecycle (graceful shutdown)

**Problem:** Child processes in `globalThis.procMap` are not killed on SIGTERM. Next.js exits and they run orphaned.

**Design:** In `session-manager.ts`, register shutdown handlers once using a `globalThis.shutdownRegistered` guard:

```ts
if (!globalThis.shutdownRegistered) {
  globalThis.shutdownRegistered = true
  const shutdown = () => {
    for (const proc of globalThis.procMap.values()) proc.kill()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('exit', shutdown)
}
```

Guard prevents duplicate registration across hot-reloads. `process.on('exit')` is synchronous so it uses `proc.kill()` not async cleanup.

---

## 6. Type consolidation

**Problem:** `TaskStatus` and `TaskPriority` live in `lib/db/tasks.ts`; `ExternalTaskStatus` and `ExternalTaskPriority` live in `lib/types/externalTask.ts`. Domain types are scattered across implementation files.

**Design:**

- Move `TaskStatus`, `TaskPriority` into `lib/types/index.ts` (alongside existing external task types)
- Re-export from `lib/db/tasks.ts` for backward compatibility during migration
- Update all imports to point to `lib/types/` directly
- Remove re-exports once all import sites are updated

`lib/types/index.ts` becomes the single source of truth for all domain status/priority types.

---

## Out of scope

- Credential validation before sync (improvement #5) — deferred
- Webhook receivers for push-based sync (improvement #8) — deferred
