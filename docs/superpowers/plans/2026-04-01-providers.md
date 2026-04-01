# Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract the hardcoded Claude binary in `lib/session-manager.ts` into a configurable provider layer supporting Claude Code, Codex, Gemini CLI, and Ollama, with hierarchical provider resolution and automatic pause-on-rate-limit.

**Architecture:** A new `providers` table in SQLite stores provider records; `lib/db/providers.ts` exposes CRUD functions; `lib/sessions/resolveProvider.ts` walks task → agent → project → global fallback at spawn time; `lib/sessions/rateLimitDetector.ts` inspects PTY output for known rate-limit strings per provider type and triggers a `paused` session status with a WebSocket notification; `lib/session-manager.ts` is updated to call both at spawn time and during the `onData` callback.

**Tech Stack:** Next.js App Router, better-sqlite3, React, inline styles, Vitest

---

## File Map

| Action  | Path                                                    | Responsibility                                          |
|---------|--------------------------------------------------------|--------------------------------------------------------|
| Modify  | `lib/db.ts`                                            | Add `providers` table, `provider_id` on projects + tasks, `paused` status type |
| Create  | `lib/db/providers.ts`                                  | Provider CRUD + types                                   |
| Create  | `app/api/providers/route.ts`                           | GET list, POST create                                   |
| Create  | `app/api/providers/[id]/route.ts`                      | GET single, PATCH update/toggle, DELETE                 |
| Create  | `lib/sessions/resolveProvider.ts`                      | Hierarchical provider resolution                        |
| Create  | `lib/sessions/rateLimitDetector.ts`                    | PTY output rate-limit pattern matching                  |
| Modify  | `lib/session-manager.ts`                               | Wire resolveProvider + RateLimitDetector, paused status |
| Modify  | `hooks/useProjects.tsx`                                | Add `provider_id` to `Project` type                     |
| Modify  | `lib/db/tasks.ts`                                      | Add `provider_id` to `Task` type + `UpdateTaskInput`    |
| Create  | `app/(dashboard)/settings/providers/page.tsx`          | Provider management UI                                  |

---

## Task 1: DB schema — providers table + provider_id migrations + paused status

**Files:**
- Modify: `lib/db.ts`
- Create: `lib/__tests__/providers-db.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/providers-db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('providers table', () => {
  it('exists with all required columns', () => {
    const cols = db.prepare('PRAGMA table_info(providers)').all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('name')
    expect(names).toContain('type')
    expect(names).toContain('command')
    expect(names).toContain('config')
    expect(names).toContain('is_active')
    expect(names).toContain('created_at')
  })

  it('defaults is_active to 1', () => {
    const now = new Date().toISOString()
    db.prepare('INSERT INTO providers (id, name, type, command, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('p-1', 'Claude', 'claude', '/home/user/.local/bin/claude', now)
    const row = db.prepare('SELECT is_active FROM providers WHERE id = ?').get('p-1') as { is_active: number }
    expect(row.is_active).toBe(1)
  })
})

describe('projects.provider_id migration', () => {
  it('projects table has provider_id column', () => {
    const cols = db.prepare('PRAGMA table_info(projects)').all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('provider_id')
  })
})

describe('tasks.provider_id migration', () => {
  it('tasks table has provider_id column', () => {
    const cols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
    expect(cols.map(c => c.name)).toContain('provider_id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/providers-db.test.ts --reporter verbose
```

Expected: FAIL — `providers` table does not exist.

- [ ] **Step 3: Implement schema changes in `lib/db.ts`**

1. Update `SessionStatus` type at the top of the file:

```typescript
export type SessionStatus = 'active' | 'ended' | 'paused'
```

2. Add the `providers` table creation as a `try/catch` migration block inside `initDb()`, after the existing migrations:

```typescript
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      command    TEXT NOT NULL,
      config     TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `)
} catch {}
```

3. Add `provider_id` to `projects` and `tasks` via `ALTER TABLE` migrations:

```typescript
try { db.exec('ALTER TABLE projects ADD COLUMN provider_id TEXT') } catch {}
try { db.exec('ALTER TABLE tasks ADD COLUMN provider_id TEXT') } catch {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/providers-db.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/__tests__/providers-db.test.ts
git commit -m "feat: add providers table + provider_id migrations + paused session status"
```

---

## Task 2: `lib/db/providers.ts` — Provider CRUD

**Files:**
- Create: `lib/db/providers.ts`
- Create: `lib/__tests__/providers-crud.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/providers-crud.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import {
  createProvider, getProvider, getProviders,
  updateProvider, deleteProvider, toggleProviderActive,
} from '@/lib/db/providers'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('createProvider', () => {
  it('inserts a provider and returns it with is_active=1', () => {
    const p = createProvider(db, {
      id: 'p-1', name: 'My Claude', type: 'claude',
      command: '/home/user/.local/bin/claude',
      config: JSON.stringify({ model: 'claude-sonnet-4-6', flags: ['--permission-mode', 'bypassPermissions'] }),
    })
    expect(p.id).toBe('p-1')
    expect(p.is_active).toBe(1)
    expect(p.created_at).toBeTruthy()
  })

  it('inserts a provider with null config', () => {
    const p = createProvider(db, { id: 'p-2', name: 'Ollama Local', type: 'ollama', command: 'ollama', config: null })
    expect(p.config).toBeNull()
  })
})

describe('getProvider', () => {
  it('returns undefined for unknown id', () => {
    expect(getProvider(db, 'nope')).toBeUndefined()
  })

  it('returns the provider by id', () => {
    createProvider(db, { id: 'p-3', name: 'Codex', type: 'codex', command: 'codex', config: null })
    expect(getProvider(db, 'p-3')?.name).toBe('Codex')
  })
})

describe('getProviders', () => {
  it('returns empty array when none exist', () => {
    expect(getProviders(db)).toEqual([])
  })

  it('returns all providers ordered by created_at ascending', () => {
    createProvider(db, { id: 'p-a', name: 'A', type: 'claude', command: 'claude', config: null })
    createProvider(db, { id: 'p-b', name: 'B', type: 'gemini', command: 'gemini', config: null })
    const all = getProviders(db)
    expect(all).toHaveLength(2)
    expect(all[0].id).toBe('p-a')
  })
})

describe('updateProvider', () => {
  it('updates name and command', () => {
    createProvider(db, { id: 'p-upd', name: 'Old', type: 'claude', command: '/old', config: null })
    const updated = updateProvider(db, 'p-upd', { name: 'New', command: '/new' })
    expect(updated.name).toBe('New')
    expect(updated.command).toBe('/new')
  })
})

describe('deleteProvider', () => {
  it('removes the provider', () => {
    createProvider(db, { id: 'p-del', name: 'Temp', type: 'ollama', command: 'ollama', config: null })
    deleteProvider(db, 'p-del')
    expect(getProvider(db, 'p-del')).toBeUndefined()
  })
})

describe('toggleProviderActive', () => {
  it('sets is_active to 0 when currently 1', () => {
    createProvider(db, { id: 'p-tog', name: 'Toggle', type: 'gemini', command: 'gemini', config: null })
    expect(toggleProviderActive(db, 'p-tog').is_active).toBe(0)
  })

  it('sets is_active to 1 when currently 0', () => {
    createProvider(db, { id: 'p-tog2', name: 'T2', type: 'gemini', command: 'gemini', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('p-tog2')
    expect(toggleProviderActive(db, 'p-tog2').is_active).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/providers-crud.test.ts --reporter verbose
```

Expected: FAIL — module `@/lib/db/providers` not found.

- [ ] **Step 3: Create `lib/db/providers.ts`**

```typescript
import type { Database } from 'better-sqlite3'

export type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

export type Provider = {
  id: string
  name: string
  type: ProviderType
  command: string
  config: string | null
  is_active: number
  created_at: string
}

export type CreateProviderInput = {
  id: string
  name: string
  type: ProviderType
  command: string
  config: string | null
}

export type UpdateProviderInput = {
  name?: string
  type?: ProviderType
  command?: string
  config?: string | null
}

export function createProvider(db: Database, input: CreateProviderInput): Provider {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO providers (id, name, type, command, config, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(input.id, input.name, input.type, input.command, input.config, now)
  return getProvider(db, input.id)!
}

export function getProvider(db: Database, id: string): Provider | undefined {
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
}

export function getProviders(db: Database): Provider[] {
  return db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as Provider[]
}

export function getActiveProviders(db: Database): Provider[] {
  return db.prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at ASC').all() as Provider[]
}

export function updateProvider(db: Database, id: string, input: UpdateProviderInput): Provider {
  const fields: string[] = []
  const values: unknown[] = []
  if ('name' in input)    { fields.push('name = ?');    values.push(input.name) }
  if ('type' in input)    { fields.push('type = ?');    values.push(input.type) }
  if ('command' in input) { fields.push('command = ?'); values.push(input.command) }
  if ('config' in input)  { fields.push('config = ?');  values.push(input.config) }
  if (fields.length === 0) return getProvider(db, id)!
  values.push(id)
  db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getProvider(db, id)!
}

export function deleteProvider(db: Database, id: string): void {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}

export function toggleProviderActive(db: Database, id: string): Provider {
  const p = getProvider(db, id)
  if (!p) throw new Error(`Provider ${id} not found`)
  db.prepare('UPDATE providers SET is_active = ? WHERE id = ?').run(p.is_active === 1 ? 0 : 1, id)
  return getProvider(db, id)!
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/providers-crud.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db/providers.ts lib/__tests__/providers-crud.test.ts
git commit -m "feat: add lib/db/providers.ts with CRUD functions"
```

---

## Task 3: `app/api/providers/route.ts` — GET list, POST create

**Files:**
- Create: `app/api/providers/route.ts`
- Create: `lib/__tests__/providers-api-list.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/providers-api-list.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { initDb } = await import('@/lib/db')
  const db = initDb(':memory:')
  return { getDb: () => db }
})

import { GET, POST } from '@/app/api/providers/route'
import { NextRequest } from 'next/server'

describe('GET /api/providers', () => {
  it('returns an empty array when no providers exist', async () => {
    const res = await GET(new NextRequest('http://localhost/api/providers'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

describe('POST /api/providers', () => {
  it('creates a provider and returns 201', async () => {
    const res = await POST(new NextRequest('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Claude Sonnet', type: 'claude', command: '/bin/claude', config: null }),
    }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Claude Sonnet')
    expect(body.is_active).toBe(1)
  })

  it('returns 400 when name or command is missing', async () => {
    const res = await POST(new NextRequest('http://localhost/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Incomplete' }),
    }))
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/providers-api-list.test.ts --reporter verbose
```

Expected: FAIL — module `@/app/api/providers/route` not found.

- [ ] **Step 3: Create `app/api/providers/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { getProviders, createProvider } from '@/lib/db/providers'
import type { ProviderType } from '@/lib/db/providers'

const VALID_TYPES: ProviderType[] = ['claude', 'codex', 'gemini', 'ollama']

export async function GET(_req: NextRequest) {
  return NextResponse.json(getProviders(getDb()))
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, type, command, config } = body

  if (!name?.trim() || !type || !command?.trim()) {
    return NextResponse.json({ error: 'name, type, and command are required' }, { status: 400 })
  }
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 })
  }

  const provider = createProvider(getDb(), {
    id: randomUUID(),
    name: name.trim(),
    type,
    command: command.trim(),
    config: config ?? null,
  })
  return NextResponse.json(provider, { status: 201 })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/providers-api-list.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/providers/route.ts lib/__tests__/providers-api-list.test.ts
git commit -m "feat: add GET/POST /api/providers route"
```

---

## Task 4: `app/api/providers/[id]/route.ts` — GET, PATCH, DELETE

**Files:**
- Create: `app/api/providers/[id]/route.ts`
- Create: `lib/__tests__/providers-api-id.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/providers-api-id.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db', async () => {
  const { initDb } = await import('@/lib/db')
  const db = initDb(':memory:')
  return { getDb: () => db }
})

import { GET, PATCH, DELETE } from '@/app/api/providers/[id]/route'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'

const p = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/providers/[id]', () => {
  it('returns 404 for unknown id', async () => {
    expect((await GET(new NextRequest('http://localhost/api/providers/nope'), p('nope'))).status).toBe(404)
  })

  it('returns the provider when found', async () => {
    createProvider(getDb(), { id: 'get-1', name: 'Test', type: 'claude', command: '/bin/claude', config: null })
    const res = await GET(new NextRequest('http://localhost/api/providers/get-1'), p('get-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('get-1')
  })
})

describe('PATCH /api/providers/[id]', () => {
  it('updates name', async () => {
    createProvider(getDb(), { id: 'patch-1', name: 'Old', type: 'codex', command: 'codex', config: null })
    const res = await PATCH(new NextRequest('http://localhost/api/providers/patch-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    }), p('patch-1'))
    expect((await res.json()).name).toBe('New Name')
  })

  it('toggles is_active when toggle_active is true', async () => {
    createProvider(getDb(), { id: 'tog-1', name: 'T', type: 'gemini', command: 'gemini', config: null })
    const res = await PATCH(new NextRequest('http://localhost/api/providers/tog-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toggle_active: true }),
    }), p('tog-1'))
    expect((await res.json()).is_active).toBe(0)
  })
})

describe('DELETE /api/providers/[id]', () => {
  it('deletes and returns ok', async () => {
    createProvider(getDb(), { id: 'del-1', name: 'Del', type: 'ollama', command: 'ollama', config: null })
    const res = await DELETE(new NextRequest('http://localhost/api/providers/del-1', { method: 'DELETE' }), p('del-1'))
    expect((await res.json()).ok).toBe(true)
  })

  it('returns 404 for unknown id', async () => {
    expect((await DELETE(new NextRequest('http://localhost/api/providers/nobody', { method: 'DELETE' }), p('nobody'))).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/providers-api-id.test.ts --reporter verbose
```

Expected: FAIL — module `@/app/api/providers/[id]/route` not found.

- [ ] **Step 3: Create `app/api/providers/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getProvider, updateProvider, deleteProvider, toggleProviderActive } from '@/lib/db/providers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const provider = getProvider(getDb(), id)
  if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(provider)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  if (!getProvider(db, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (body.toggle_active) return NextResponse.json(toggleProviderActive(db, id))

  const allowed = ['name', 'type', 'command', 'config'] as const
  const input: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) input[key] = body[key]
  }
  return NextResponse.json(updateProvider(db, id, input))
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  if (!getProvider(db, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  deleteProvider(db, id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/providers-api-id.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/providers/[id]/route.ts lib/__tests__/providers-api-id.test.ts
git commit -m "feat: add GET/PATCH/DELETE /api/providers/[id] route"
```

---

## Task 5: `lib/sessions/resolveProvider.ts` — Hierarchical provider resolution

**Files:**
- Create: `lib/sessions/resolveProvider.ts`
- Create: `lib/__tests__/resolveProvider.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/resolveProvider.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createProvider } from '@/lib/db/providers'
import { resolveProvider } from '@/lib/sessions/resolveProvider'

let db: Database

function insertProject(db: Database, id: string, providerId: string | null = null) {
  db.prepare('INSERT INTO projects (id, name, path, created_at, provider_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, `Project ${id}`, `/tmp/${id}`, new Date().toISOString(), providerId)
}

function insertTask(db: Database, id: string, projectId: string, providerId: string | null = null) {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO tasks (id, project_id, title, status, created_at, updated_at, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, projectId, `Task ${id}`, 'idea', now, now, providerId)
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('resolveProvider', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers exist', () => {
    insertProject(db, 'proj-empty')
    expect(() => resolveProvider(db, { projectId: 'proj-empty' })).toThrow('NO_PROVIDERS_CONFIGURED')
  })

  it('returns first active provider when no overrides', () => {
    insertProject(db, 'proj-global')
    const p = createProvider(db, { id: 'global-1', name: 'Global', type: 'claude', command: '/bin/claude', config: null })
    expect(resolveProvider(db, { projectId: 'proj-global' }).id).toBe(p.id)
  })

  it('skips inactive providers', () => {
    insertProject(db, 'proj-inactive')
    createProvider(db, { id: 'off-1', name: 'Off', type: 'codex', command: 'codex', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('off-1')
    const active = createProvider(db, { id: 'on-1', name: 'On', type: 'gemini', command: 'gemini', config: null })
    expect(resolveProvider(db, { projectId: 'proj-inactive' }).id).toBe(active.id)
  })

  it('throws when only inactive providers exist', () => {
    insertProject(db, 'proj-all-off')
    createProvider(db, { id: 'x-1', name: 'X', type: 'ollama', command: 'ollama', config: null })
    db.prepare('UPDATE providers SET is_active = 0 WHERE id = ?').run('x-1')
    expect(() => resolveProvider(db, { projectId: 'proj-all-off' })).toThrow('NO_PROVIDERS_CONFIGURED')
  })

  it('uses project-level provider_id override', () => {
    const pp = createProvider(db, { id: 'pp-1', name: 'Project', type: 'codex', command: 'codex', config: null })
    createProvider(db, { id: 'g-1', name: 'Global', type: 'claude', command: '/bin/claude', config: null })
    insertProject(db, 'proj-override', pp.id)
    expect(resolveProvider(db, { projectId: 'proj-override' }).id).toBe(pp.id)
  })

  it('uses task-level provider_id over project-level', () => {
    const pp = createProvider(db, { id: 'pp-2', name: 'Project', type: 'codex', command: 'codex', config: null })
    const tp = createProvider(db, { id: 'tp-1', name: 'Task', type: 'gemini', command: 'gemini', config: null })
    insertProject(db, 'proj-task', pp.id)
    insertTask(db, 'task-override', 'proj-task', tp.id)
    expect(resolveProvider(db, { projectId: 'proj-task', taskId: 'task-override' }).id).toBe(tp.id)
  })

  it('falls back to project when task has no provider_id', () => {
    const pp = createProvider(db, { id: 'pp-fb', name: 'ProjFB', type: 'codex', command: 'codex', config: null })
    createProvider(db, { id: 'g-fb', name: 'GlobalFB', type: 'claude', command: '/bin/claude', config: null })
    insertProject(db, 'proj-fb', pp.id)
    insertTask(db, 'task-no-prov', 'proj-fb', null)
    expect(resolveProvider(db, { projectId: 'proj-fb', taskId: 'task-no-prov' }).id).toBe(pp.id)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/resolveProvider.test.ts --reporter verbose
```

Expected: FAIL — module `@/lib/sessions/resolveProvider` not found.

- [ ] **Step 3: Create `lib/sessions/resolveProvider.ts`**

```typescript
import type { Database } from 'better-sqlite3'
import { getProvider, getActiveProviders } from '@/lib/db/providers'
import type { Provider } from '@/lib/db/providers'

export type ResolveProviderOpts = {
  projectId: string
  taskId?: string
  agentId?: string
}

export function resolveProvider(db: Database, opts: ResolveProviderOpts): Provider {
  // 1. Task-level override
  if (opts.taskId) {
    const task = db.prepare('SELECT provider_id FROM tasks WHERE id = ?')
      .get(opts.taskId) as { provider_id: string | null } | undefined
    if (task?.provider_id) {
      const p = getProvider(db, task.provider_id)
      if (p && p.is_active === 1) return p
    }
  }

  // 2. Agent-level override (agents table may not exist yet — guard with try/catch)
  if (opts.agentId) {
    try {
      const agent = db.prepare('SELECT provider_id FROM agents WHERE id = ?')
        .get(opts.agentId) as { provider_id: string | null } | undefined
      if (agent?.provider_id) {
        const p = getProvider(db, agent.provider_id)
        if (p && p.is_active === 1) return p
      }
    } catch {
      // agents table does not exist yet — skip
    }
  }

  // 3. Project-level override
  const project = db.prepare('SELECT provider_id FROM projects WHERE id = ?')
    .get(opts.projectId) as { provider_id: string | null } | undefined
  if (project?.provider_id) {
    const p = getProvider(db, project.provider_id)
    if (p && p.is_active === 1) return p
  }

  // 4. First active provider by created_at
  const active = getActiveProviders(db)
  if (active.length > 0) return active[0]

  throw new Error('NO_PROVIDERS_CONFIGURED')
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/resolveProvider.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/resolveProvider.ts lib/__tests__/resolveProvider.test.ts
git commit -m "feat: add resolveProvider with hierarchical task/agent/project/global fallback"
```

---

## Task 6: `lib/sessions/rateLimitDetector.ts` — PTY output rate-limit detection

**Files:**
- Create: `lib/sessions/rateLimitDetector.ts`
- Create: `lib/__tests__/rateLimitDetector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/rateLimitDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { RateLimitDetector } from '@/lib/sessions/rateLimitDetector'

describe('RateLimitDetector — claude', () => {
  const d = new RateLimitDetector('claude')
  it('detects rate_limit_exceeded', () => { expect(d.check('Error: rate_limit_exceeded')).toBe(true) })
  it('detects overloaded_error', () => { expect(d.check('{"type":"overloaded_error"}')).toBe(true) })
  it('detects 529', () => { expect(d.check('HTTP 529 Overloaded')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('Reading file src/index.ts')).toBe(false) })
})

describe('RateLimitDetector — codex', () => {
  const d = new RateLimitDetector('codex')
  it('detects rate_limit_exceeded', () => { expect(d.check('rate_limit_exceeded: wait')).toBe(true) })
  it('detects quota_exceeded', () => { expect(d.check('quota_exceeded for plan')).toBe(true) })
  it('detects 429', () => { expect(d.check('Response 429 Too Many Requests')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('const x = 429')).toBe(false) })
})

describe('RateLimitDetector — gemini', () => {
  const d = new RateLimitDetector('gemini')
  it('detects RESOURCE_EXHAUSTED', () => { expect(d.check('Status: RESOURCE_EXHAUSTED')).toBe(true) })
  it('detects quota exceeded (case-insensitive)', () => { expect(d.check('quota exceeded for project')).toBe(true) })
  it('detects 429', () => { expect(d.check('429 from Gemini API')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('Resource loading complete')).toBe(false) })
})

describe('RateLimitDetector — ollama', () => {
  const d = new RateLimitDetector('ollama')
  it('never triggers', () => {
    expect(d.check('rate_limit_exceeded')).toBe(false)
    expect(d.check('RESOURCE_EXHAUSTED')).toBe(false)
    expect(d.check('429')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/rateLimitDetector.test.ts --reporter verbose
```

Expected: FAIL — module `@/lib/sessions/rateLimitDetector` not found.

- [ ] **Step 3: Create `lib/sessions/rateLimitDetector.ts`**

```typescript
import type { ProviderType } from '@/lib/db/providers'

const PATTERNS: Record<ProviderType, RegExp[]> = {
  claude:  [/rate_limit_exceeded/, /overloaded_error/, /\b529\b/],
  codex:   [/rate_limit_exceeded/, /quota_exceeded/, /\b429\b/],
  gemini:  [/RESOURCE_EXHAUSTED/, /quota exceeded/i, /\b429\b/],
  ollama:  [],
}

export class RateLimitDetector {
  private patterns: RegExp[]

  constructor(providerType: ProviderType) {
    this.patterns = PATTERNS[providerType] ?? []
  }

  check(text: string): boolean {
    return this.patterns.some(p => p.test(text))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/rateLimitDetector.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/rateLimitDetector.ts lib/__tests__/rateLimitDetector.test.ts
git commit -m "feat: add RateLimitDetector for claude/codex/gemini/ollama"
```

---

## Task 7: Modify `lib/session-manager.ts` — wire resolveProvider + RateLimitDetector

**Files:**
- Modify: `lib/session-manager.ts`
- Create: `lib/__tests__/session-manager-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/session-manager-provider.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({ onData: vi.fn(), onExit: vi.fn(), kill: vi.fn() })),
}))

vi.mock('@/lib/db', async () => {
  const { initDb } = await import('@/lib/db')
  const db = initDb(':memory:')
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run('proj-test', 'Test', '/tmp/test', new Date().toISOString())
  return {
    getDb: () => db,
    createSession: vi.fn(),
    endSession: vi.fn(),
    getActiveSessionForFile: vi.fn(() => undefined),
    getProject: vi.fn(() => ({ path: '/tmp/test' })),
    listContextPacks: vi.fn(() => []),
  }
})

vi.mock('@/lib/events', () => ({ logEvent: vi.fn() }))
vi.mock('@/lib/prompts', () => ({
  buildArgs: vi.fn(() => []),
  buildSessionContext: vi.fn(() => ''),
  buildTaskContext: vi.fn(() => ''),
}))
vi.mock('@/lib/db/tasks', () => ({ getTask: vi.fn(() => undefined), updateTask: vi.fn() }))
vi.mock('@/lib/git', () => ({ getGitHistory: vi.fn(() => '') }))
vi.mock('@/lib/debrief', () => ({ generateDebrief: vi.fn(() => Promise.resolve(null)) }))
vi.mock('@/lib/frontmatter', () => ({ writeFrontmatter: vi.fn((c: string) => c) }))

import { spawnSession } from '@/lib/session-manager'

describe('spawnSession provider resolution', () => {
  it('throws NO_PROVIDERS_CONFIGURED when no providers are configured', () => {
    expect(() => spawnSession({
      projectId: 'proj-test', projectPath: '/tmp/test', label: 'test',
      phase: 'develop', sourceFile: null, userContext: '', permissionMode: 'default',
    })).toThrow('NO_PROVIDERS_CONFIGURED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/session-manager-provider.test.ts --reporter verbose
```

Expected: FAIL — throws `'Claude binary not found'` instead of `'NO_PROVIDERS_CONFIGURED'`.

- [ ] **Step 3: Modify `lib/session-manager.ts`**

**3a. Add imports** after the existing import block:

```typescript
import { resolveProvider } from './sessions/resolveProvider'
import { RateLimitDetector } from './sessions/rateLimitDetector'
```

**3b. Extend `SpawnOptions`** — add two optional fields:

```typescript
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
  correctionNote?: string
  taskId?: string
  outputPath?: string
  agentId?: string
  providerId?: string
}
```

**3c. Replace the `if (!CLAUDE_BIN)` guard at the start of `spawnSession`** with provider resolution:

```typescript
export function spawnSession(opts: SpawnOptions): string {
  const db = getDb()
  const provider = resolveProvider(db, {
    projectId: opts.projectId,
    taskId: opts.taskId,
    agentId: opts.agentId,
  })
  const sessionId = randomUUID()
  // ... rest of existing function unchanged
```

**3d. Replace `CLAUDE_BIN!` in the `pty.spawn` call** with `provider.command`:

```typescript
  const proc = pty.spawn(provider.command, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: opts.projectPath,
    env: { ...process.env },
  })
```

**3e. Instantiate `RateLimitDetector`** once per session, just before `ptyMap.set(sessionId, proc)`:

```typescript
  const detector = new RateLimitDetector(provider.type)
```

**3f. Add rate-limit check inside `proc.onData`**, after `outputBuffer.set(sessionId, buf)` and before the broadcast loop:

```typescript
    if (detector.check(data)) {
      db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId)
      const clients = wsMap.get(sessionId) ?? new Set()
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'rate_limit', provider: provider.name }))
        }
      }
    }
```

**3g. Update `spawnOrchestratorSession`** — replace `if (!CLAUDE_BIN)` guard and `CLAUDE_BIN!` with provider resolution:

```typescript
export function spawnOrchestratorSession(opts: {
  orchestratorId: string
  projectId: string
  projectPath: string
}): string {
  const db = getDb()
  const provider = resolveProvider(db, { projectId: opts.projectId })
  const sessionId = randomUUID()
  // ...
  const proc = pty.spawn(provider.command, args, {
    name: 'xterm-color', cols: 80, rows: 24,
    cwd: opts.projectPath, env: { ...process.env },
  })
```

**3h. Remove dead code** — delete `resolveClaude()`, `CLAUDE_BIN`, and `isClaudeAvailable()`. First check for callers:

```bash
grep -r "isClaudeAvailable" /home/tomespen/git/project-control/app /home/tomespen/git/project-control/components /home/tomespen/git/project-control/lib --include="*.ts" --include="*.tsx"
```

For each caller found, replace with: `getActiveProviders(getDb()).length > 0` (import `getActiveProviders` from `@/lib/db/providers`).

- [ ] **Step 4: Run the failing test to verify it passes**

```bash
npx vitest run lib/__tests__/session-manager-provider.test.ts --reporter verbose
```

Expected: PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npx vitest run --reporter verbose
```

Expected: All previously passing tests continue to pass.

- [ ] **Step 6: Commit**

```bash
git add lib/session-manager.ts lib/__tests__/session-manager-provider.test.ts
git commit -m "feat: wire resolveProvider + RateLimitDetector into spawnSession"
```

---

## Task 8: Update type references

**Files:**
- Modify: `hooks/useProjects.tsx`
- Modify: `lib/db/tasks.ts`
- Modify: `lib/__tests__/providers-db.test.ts`

- [ ] **Step 1: Add `provider_id` to `Project` type in `hooks/useProjects.tsx`**

```typescript
export type Project = {
  id: string; name: string; path: string
  ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null
  last_used_at: string | null
  provider_id: string | null
}
```

- [ ] **Step 2: Add `provider_id` to `Task` type and `UpdateTaskInput` in `lib/db/tasks.ts`**

Add to `Task` type:
```typescript
  provider_id: string | null
```

Add to `UpdateTaskInput`:
```typescript
  provider_id?: string | null
```

Add to `updateTask` function body (after the `notes` handler):
```typescript
  if ('provider_id' in input) { updates.push('provider_id = ?'); values.push(input.provider_id) }
```

- [ ] **Step 3: Add a targeted test to `lib/__tests__/providers-db.test.ts`**

Append to the existing test file:

```typescript
import { createTask, updateTask } from '@/lib/db/tasks'
import { createProvider } from '@/lib/db/providers'

describe('tasks.provider_id field', () => {
  it('createTask returns provider_id as null by default', () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('tp-proj', 'P', '/tmp/p', new Date().toISOString())
    const task = createTask(db, { id: 'tp-1', projectId: 'tp-proj', title: 'T' })
    expect(task.provider_id).toBeNull()
  })

  it('updateTask can set provider_id', () => {
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('tp-proj2', 'P2', '/tmp/p2', new Date().toISOString())
    createProvider(db, { id: 'tp-prov', name: 'TP', type: 'claude', command: '/bin/claude', config: null })
    const task = createTask(db, { id: 'tp-2', projectId: 'tp-proj2', title: 'T2' })
    const updated = updateTask(db, 'tp-2', { provider_id: 'tp-prov' })
    expect(updated.provider_id).toBe('tp-prov')
  })
})
```

- [ ] **Step 4: Run tests to verify everything passes**

```bash
npx vitest run lib/__tests__/providers-db.test.ts --reporter verbose
npx tsc --noEmit
```

Expected: All tests pass, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add hooks/useProjects.tsx lib/db/tasks.ts lib/__tests__/providers-db.test.ts
git commit -m "feat: add provider_id to Project and Task types"
```

---

## Task 9: `app/(dashboard)/settings/providers/page.tsx` — Provider management UI

**Files:**
- Create: `app/(dashboard)/settings/providers/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

type Provider = {
  id: string; name: string; type: ProviderType; command: string
  config: string | null; is_active: number; created_at: string
}

const TYPE_LABELS: Record<ProviderType, string> = {
  claude: 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI', ollama: 'Ollama',
}

const TYPE_PLACEHOLDER: Record<ProviderType, string> = {
  claude: '~/.local/bin/claude', codex: 'codex', gemini: 'gemini', ollama: 'ollama',
}

const TYPE_COLOR: Record<ProviderType, string> = {
  claude: '#6b4f9e', codex: '#2e6fa3', gemini: '#3a7d44', ollama: '#7d5a2e',
}

const S = {
  bg: '#0d0e10', surface: '#141618', border: '#1e2124',
  muted: '#8a9199', primary: '#5b9bd5', danger: '#c04040',
  text: '#d4d9de', dim: '#5a6370',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
  padding: '6px 10px', color: S.text, fontSize: 13, boxSizing: 'border-box',
}

function ConfigFields({ type, config, onChange }: {
  type: ProviderType
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
}) {
  if (type === 'ollama') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Host</label>
          <input value={(config.host as string) ?? ''} onChange={e => onChange({ ...config, host: e.target.value })}
            placeholder="http://localhost:11434" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Model</label>
          <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
            placeholder="qwen2.5-coder" style={inputStyle} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Model</label>
        <input value={(config.model as string) ?? ''} onChange={e => onChange({ ...config, model: e.target.value })}
          placeholder={type === 'claude' ? 'claude-sonnet-4-6' : type === 'gemini' ? 'gemini-2.5-pro' : 'codex-mini'}
          style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>
          Extra flags <span style={{ color: S.dim }}>(space-separated)</span>
        </label>
        <input
          value={((config.flags as string[]) ?? []).join(' ')}
          onChange={e => onChange({ ...config, flags: e.target.value.trim() ? e.target.value.trim().split(/\s+/) : [] })}
          placeholder="--permission-mode bypassPermissions"
          style={inputStyle}
        />
      </div>
    </div>
  )
}

export default function ProvidersPage() {
  const qc = useQueryClient()
  const { data: providers = [], isLoading } = useQuery<Provider[]>({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/providers').then(r => r.json()),
  })

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<ProviderType>('claude')
  const [formCommand, setFormCommand] = useState('')
  const [formConfig, setFormConfig] = useState<Record<string, unknown>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'pending' | 'pass' | 'fail'>>({})

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      fetch('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? 'Failed') } return r.json() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] })
      setShowForm(false); setFormName(''); setFormType('claude'); setFormCommand(''); setFormConfig({}); setFormError(null)
    },
    onError: (e: Error) => setFormError(e.message),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/providers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toggle_active: true }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetch(`/api/providers/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  })

  async function handleTest(provider: Provider) {
    setTestResults(r => ({ ...r, [provider.id]: 'pending' }))
    try {
      const res = await fetch(`/api/providers/${provider.id}/test`, { method: 'POST' })
      setTestResults(r => ({ ...r, [provider.id]: res.ok ? 'pass' : 'fail' }))
    } catch {
      setTestResults(r => ({ ...r, [provider.id]: 'fail' }))
    }
  }

  function handleSubmit() {
    if (!formName.trim()) { setFormError('Name is required'); return }
    if (!formCommand.trim()) { setFormError('Command is required'); return }
    setFormError(null)
    createMutation.mutate({ name: formName.trim(), type: formType, command: formCommand.trim(), config: JSON.stringify(formConfig) })
  }

  return (
    <div style={{ maxWidth: 700, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ color: S.text, fontSize: 16, fontWeight: 600, margin: 0 }}>Providers</h2>
          <p style={{ color: S.muted, fontSize: 13, margin: '4px 0 0' }}>Configure AI provider binaries for session spawning.</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: S.primary, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
          {showForm ? 'Cancel' : '+ Add Provider'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h3 style={{ color: S.text, fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>New Provider</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Claude" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Type</label>
              <select value={formType} onChange={e => { setFormType(e.target.value as ProviderType); setFormConfig({}) }}
                style={{ ...inputStyle }}>
                {(Object.keys(TYPE_LABELS) as ProviderType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 4 }}>Command</label>
              <input value={formCommand} onChange={e => setFormCommand(e.target.value)}
                placeholder={TYPE_PLACEHOLDER[formType]} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', color: S.muted, fontSize: 12, marginBottom: 8 }}>Config</label>
              <ConfigFields type={formType} config={formConfig} onChange={setFormConfig} />
            </div>
            {formError && <div style={{ color: S.danger, fontSize: 12 }}>{formError}</div>}
            <button onClick={handleSubmit} disabled={createMutation.isPending}
              style={{ background: S.primary, color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: 500, alignSelf: 'flex-start', opacity: createMutation.isPending ? 0.6 : 1 }}>
              {createMutation.isPending ? 'Saving…' : 'Save Provider'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: S.muted, fontSize: 13 }}>Loading…</div>
      ) : providers.length === 0 ? (
        <div style={{ color: S.dim, fontSize: 14, padding: '32px 0', textAlign: 'center' }}>No providers configured. Add one above.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {providers.map(p => {
            const testResult = testResults[p.id]
            return (
              <div key={p.id} style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: p.is_active === 0 ? 0.55 : 1 }}>
                <span style={{ background: TYPE_COLOR[p.type], color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {TYPE_LABELS[p.type]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: S.text, fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ color: S.muted, fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.command}</div>
                </div>
                {testResult && (
                  <span style={{ fontSize: 12, flexShrink: 0, color: testResult === 'pass' ? '#3a8c5c' : testResult === 'fail' ? S.danger : S.muted }}>
                    {testResult === 'pending' ? 'Testing…' : testResult === 'pass' ? 'OK' : 'Failed'}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => handleTest(p)} disabled={testResult === 'pending'}
                    style={{ background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 4, padding: '4px 10px', color: S.muted, fontSize: 12, cursor: 'pointer' }}>
                    Test
                  </button>
                  <button onClick={() => toggleMutation.mutate(p.id)}
                    title={p.is_active === 1 ? 'Disable' : 'Enable'}
                    style={{ width: 36, height: 20, borderRadius: 10, background: p.is_active === 1 ? S.primary : S.border, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                    <span style={{ position: 'absolute', top: 2, left: p.is_active === 1 ? 18 : 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.15s' }} />
                  </button>
                  <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id) }}
                    style={{ background: 'transparent', border: `1px solid ${S.border}`, borderRadius: 4, padding: '4px 10px', color: S.danger, fontSize: 12, cursor: 'pointer' }}>
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

> **Note:** The Test button calls `POST /api/providers/[id]/test`. That route is out of scope for this plan. The button degrades gracefully — it shows "Failed" when the route returns non-2xx.

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/settings/providers/page.tsx
git commit -m "feat: add provider management UI at /settings/providers"
```

---

## Self-Review

**Spec coverage:**
- [x] `providers` table + `provider_id` on projects/tasks: Task 1
- [x] `paused` session status: Task 1 (SessionStatus type) + Task 7 (SQL UPDATE)
- [x] Provider CRUD (`createProvider`, `getProvider`, `getProviders`, `updateProvider`, `deleteProvider`): Task 2
- [x] GET/POST `/api/providers`: Task 3
- [x] GET/PATCH/DELETE `/api/providers/[id]` with `toggle_active`: Task 4
- [x] Hierarchical resolution task→agent→project→global: Task 5
- [x] Rate-limit patterns per provider type: Task 6
- [x] `RateLimitDetector` wired in `proc.onData`, session set to `paused`, WS broadcast: Task 7
- [x] `hooks/useProjects.tsx` `provider_id`: Task 8
- [x] `lib/db/tasks.ts` `provider_id`: Task 8
- [x] Provider management UI with list/toggle/test/delete/add form: Task 9

**No placeholders.** All code blocks are complete.

**Type consistency:**
- `ProviderType` defined in `lib/db/providers.ts`, imported in `rateLimitDetector.ts` and `resolveProvider.ts` — consistent.
- `Provider` type used in API routes and UI — consistent.
- `resolveProvider(db, { projectId, taskId?, agentId? })` matches `ResolveProviderOpts` — consistent.
- `RateLimitDetector` takes `ProviderType`, `provider.type` is `ProviderType` — consistent.
- `toggleProviderActive` returns `Provider` with updated `is_active` — consistent with PATCH route expectations.
