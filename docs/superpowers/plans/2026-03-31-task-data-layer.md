# Task Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `tasks` table and all backend logic so every session can be linked to a task, prior phase artifacts are injected automatically into session prompts, and completed artifacts are written back to the task record.

**Architecture:** New `tasks` table in SQLite, a dedicated CRUD module at `lib/db/tasks.ts`, REST API routes under `/api/tasks`, and modifications to `lib/prompts.ts` + `lib/session-manager.ts` to assemble and inject task context on launch and write artifact refs back on session end.

**Tech Stack:** better-sqlite3, Next.js App Router API routes, Vitest, Node fs

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `lib/db.ts` | Add tasks table creation + sessions.task_id migration |
| Create | `lib/db/tasks.ts` | Task CRUD: createTask, getTask, getTasksByProject, updateTask, advanceTaskStatus |
| Create | `app/api/tasks/route.ts` | GET (list by project+status) + POST (create task) |
| Create | `app/api/tasks/[id]/route.ts` | GET (single task) + PATCH (update fields / advance status) |
| Create | `app/api/migrate/tasks/route.ts` | POST — one-time migration from file dirs to task records |
| Modify | `lib/prompts.ts` | buildTaskContext(), generateOutputPath() |
| Modify | `lib/session-manager.ts` | Inject task context on launch; write file ref back on session end |
| Create | `__tests__/lib/tasks.test.ts` | Unit tests for lib/db/tasks.ts |

---

### Task 1: Add tasks table to schema

**Files:**
- Modify: `lib/db.ts`
- Test: `__tests__/lib/tasks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/tasks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'

let db: Database

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('tasks table', () => {
  it('exists with expected columns', () => {
    const cols = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('project_id')
    expect(names).toContain('title')
    expect(names).toContain('status')
    expect(names).toContain('idea_file')
    expect(names).toContain('spec_file')
    expect(names).toContain('plan_file')
    expect(names).toContain('dev_summary')
    expect(names).toContain('commit_refs')
    expect(names).toContain('doc_refs')
    expect(names).toContain('notes')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('defaults status to idea', () => {
    const projectId = 'proj-1'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(projectId, 'Test', '/tmp/test', new Date().toISOString())
    db.prepare("INSERT INTO tasks (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run('t-1', projectId, 'My task', new Date().toISOString(), new Date().toISOString())
    const row = db.prepare("SELECT status FROM tasks WHERE id = ?").get('t-1') as { status: string }
    expect(row.status).toBe('idea')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: FAIL — `tasks` table does not exist.

- [ ] **Step 3: Add tasks table to initDb() in lib/db.ts**

Inside the `initDb()` function, after the existing `CREATE TABLE IF NOT EXISTS sessions` block, add:

```typescript
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'idea',
    idea_file   TEXT,
    spec_file   TEXT,
    plan_file   TEXT,
    dev_summary TEXT,
    commit_refs TEXT,
    doc_refs    TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  )
`)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts __tests__/lib/tasks.test.ts
git commit -m "feat: add tasks table to schema"
```

---

### Task 2: Add task_id column to sessions table

**Files:**
- Modify: `lib/db.ts`
- Test: `__tests__/lib/tasks.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `__tests__/lib/tasks.test.ts`:

```typescript
describe('sessions.task_id', () => {
  it('has task_id column', () => {
    const cols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]
    const names = cols.map(c => c.name)
    expect(names).toContain('task_id')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: FAIL — `task_id` column does not exist on sessions.

- [ ] **Step 3: Add migration to initDb() in lib/db.ts**

After the existing try-catch migration blocks, add:

```typescript
try {
  db.exec('ALTER TABLE sessions ADD COLUMN task_id TEXT REFERENCES tasks(id)')
} catch {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts __tests__/lib/tasks.test.ts
git commit -m "feat: add task_id foreign key to sessions"
```

---

### Task 3: Task CRUD library

**Files:**
- Create: `lib/db/tasks.ts`
- Test: `__tests__/lib/tasks.test.ts`

- [ ] **Step 1: Write failing tests for all CRUD functions**

Append to `__tests__/lib/tasks.test.ts`:

```typescript
import { createTask, getTask, getTasksByProject, updateTask, advanceTaskStatus } from '@/lib/db/tasks'

describe('createTask', () => {
  it('creates a task with status idea', () => {
    const projectId = 'proj-crud'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(projectId, 'Test', '/tmp/test', new Date().toISOString())
    const task = createTask(db, { id: 'task-1', projectId, title: 'Auth redesign' })
    expect(task.id).toBe('task-1')
    expect(task.status).toBe('idea')
    expect(task.title).toBe('Auth redesign')
    expect(task.idea_file).toBeNull()
  })
})

describe('getTask', () => {
  it('returns undefined for unknown id', () => {
    expect(getTask(db, 'nonexistent')).toBeUndefined()
  })
})

describe('getTasksByProject', () => {
  it('returns tasks filtered by project', () => {
    const pid = 'proj-filter'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/p', new Date().toISOString())
    createTask(db, { id: 'ta', projectId: pid, title: 'A' })
    createTask(db, { id: 'tb', projectId: pid, title: 'B' })
    const tasks = getTasksByProject(db, pid)
    expect(tasks).toHaveLength(2)
  })

  it('filters by status when provided', () => {
    const pid = 'proj-status'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/ps', new Date().toISOString())
    createTask(db, { id: 'tc', projectId: pid, title: 'C' })
    createTask(db, { id: 'td', projectId: pid, title: 'D' })
    advanceTaskStatus(db, 'td', 'speccing')
    const ideas = getTasksByProject(db, pid, 'idea')
    expect(ideas).toHaveLength(1)
    expect(ideas[0].id).toBe('tc')
  })
})

describe('updateTask', () => {
  it('updates artifact file refs', () => {
    const pid = 'proj-update'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pu', new Date().toISOString())
    createTask(db, { id: 'te', projectId: pid, title: 'E' })
    const updated = updateTask(db, 'te', { idea_file: '/tmp/idea.md' })
    expect(updated.idea_file).toBe('/tmp/idea.md')
  })

  it('updates notes', () => {
    const pid = 'proj-notes'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pn', new Date().toISOString())
    createTask(db, { id: 'tf', projectId: pid, title: 'F' })
    const updated = updateTask(db, 'tf', { notes: 'Watch out for X' })
    expect(updated.notes).toBe('Watch out for X')
  })
})

describe('advanceTaskStatus', () => {
  it('advances status forward', () => {
    const pid = 'proj-advance'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pa', new Date().toISOString())
    createTask(db, { id: 'tg', projectId: pid, title: 'G' })
    const advanced = advanceTaskStatus(db, 'tg', 'speccing')
    expect(advanced.status).toBe('speccing')
  })

  it('does not go backwards', () => {
    const pid = 'proj-back'
    db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(pid, 'P', '/tmp/pb', new Date().toISOString())
    createTask(db, { id: 'th', projectId: pid, title: 'H' })
    advanceTaskStatus(db, 'th', 'planning')
    const unchanged = advanceTaskStatus(db, 'th', 'idea')
    expect(unchanged.status).toBe('planning')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: FAIL — `lib/db/tasks.ts` does not exist.

- [ ] **Step 3: Create lib/db/tasks.ts**

```typescript
import type { Database } from 'better-sqlite3'

export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'

export type Task = {
  id: string
  project_id: string
  title: string
  status: TaskStatus
  idea_file: string | null
  spec_file: string | null
  plan_file: string | null
  dev_summary: string | null
  commit_refs: string | null
  doc_refs: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type CreateTaskInput = {
  id: string
  projectId: string
  title: string
}

export function createTask(db: Database, input: CreateTaskInput): Task {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
    VALUES (?, ?, ?, 'idea', ?, ?)
  `).run(input.id, input.projectId, input.title, now, now)
  return getTask(db, input.id)!
}

export function getTask(db: Database, id: string): Task | undefined {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function getTasksByProject(
  db: Database,
  projectId: string,
  status?: TaskStatus
): Task[] {
  if (status) {
    return db.prepare(
      'SELECT * FROM tasks WHERE project_id = ? AND status = ? ORDER BY updated_at DESC'
    ).all(projectId, status) as Task[]
  }
  return db.prepare(
    'SELECT * FROM tasks WHERE project_id = ? ORDER BY updated_at DESC'
  ).all(projectId) as Task[]
}

export type UpdateTaskInput = {
  idea_file?: string | null
  spec_file?: string | null
  plan_file?: string | null
  dev_summary?: string | null
  commit_refs?: string[]
  doc_refs?: string[]
  notes?: string | null
}

export function updateTask(db: Database, id: string, input: UpdateTaskInput): Task {
  const updates: string[] = []
  const values: unknown[] = []

  if ('idea_file' in input)   { updates.push('idea_file = ?');   values.push(input.idea_file) }
  if ('spec_file' in input)   { updates.push('spec_file = ?');   values.push(input.spec_file) }
  if ('plan_file' in input)   { updates.push('plan_file = ?');   values.push(input.plan_file) }
  if ('dev_summary' in input) { updates.push('dev_summary = ?'); values.push(input.dev_summary) }
  if ('commit_refs' in input) { updates.push('commit_refs = ?'); values.push(JSON.stringify(input.commit_refs)) }
  if ('doc_refs' in input)    { updates.push('doc_refs = ?');    values.push(JSON.stringify(input.doc_refs)) }
  if ('notes' in input)       { updates.push('notes = ?');       values.push(input.notes) }

  if (updates.length === 0) return getTask(db, id)!

  updates.push('updated_at = ?')
  values.push(new Date().toISOString(), id)

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getTask(db, id)!
}

const STATUS_ORDER: TaskStatus[] = ['idea', 'speccing', 'planning', 'developing', 'done']

export function advanceTaskStatus(db: Database, id: string, newStatus: TaskStatus): Task {
  const task = getTask(db, id)
  if (!task) throw new Error(`Task ${id} not found`)

  const currentIndex = STATUS_ORDER.indexOf(task.status)
  const newIndex = STATUS_ORDER.indexOf(newStatus)

  if (newIndex <= currentIndex) return task

  const now = new Date().toISOString()
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, id)
  return getTask(db, id)!
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: PASS all tests

- [ ] **Step 5: Commit**

```bash
git add lib/db/tasks.ts __tests__/lib/tasks.test.ts
git commit -m "feat: add task CRUD library"
```

---

### Task 4: Task API — list and create

**Files:**
- Create: `app/api/tasks/route.ts`

- [ ] **Step 1: Create app/api/tasks/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { createTask, getTasksByProject } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/db/tasks'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status') as TaskStatus | null

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const db = getDb()
  const tasks = getTasksByProject(db, projectId, status ?? undefined)
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { projectId, title } = body

  if (!projectId || !title?.trim()) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 })
  }

  const db = getDb()
  const task = createTask(db, { id: randomUUID(), projectId, title: title.trim() })
  return NextResponse.json(task, { status: 201 })
}
```

- [ ] **Step 2: Start dev server and smoke test**

```bash
npm run dev
```

In a second terminal:

```bash
# Replace PROJ_ID with a real project id from your DB
curl -s "http://localhost:3000/api/tasks?projectId=PROJ_ID" | jq .
# Expected: []

curl -s -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJ_ID","title":"Test task"}' | jq .
# Expected: task object with status "idea"

curl -s "http://localhost:3000/api/tasks?projectId=PROJ_ID" | jq .
# Expected: array with the new task
```

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/route.ts
git commit -m "feat: add GET/POST /api/tasks"
```

---

### Task 5: Task API — get and update

**Files:**
- Create: `app/api/tasks/[id]/route.ts`

- [ ] **Step 1: Create app/api/tasks/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTask, updateTask, advanceTaskStatus } from '@/lib/db/tasks'
import type { TaskStatus, UpdateTaskInput } from '@/lib/db/tasks'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const db = getDb()
  const task = getTask(db, params.id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const db = getDb()

  const task = getTask(db, params.id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Status advance is handled separately to enforce forward-only rule
  if (body.status) {
    const advanced = advanceTaskStatus(db, params.id, body.status as TaskStatus)
    return NextResponse.json(advanced)
  }

  const allowed: (keyof UpdateTaskInput)[] = [
    'idea_file', 'spec_file', 'plan_file', 'dev_summary',
    'commit_refs', 'doc_refs', 'notes'
  ]
  const input: UpdateTaskInput = {}
  for (const key of allowed) {
    if (key in body) (input as Record<string, unknown>)[key] = body[key]
  }

  const updated = updateTask(db, params.id, input)
  return NextResponse.json(updated)
}
```

- [ ] **Step 2: Smoke test**

```bash
# Get the task id from Task 4 smoke test output
TASK_ID="<id from previous step>"

curl -s "http://localhost:3000/api/tasks/$TASK_ID" | jq .status
# Expected: "idea"

curl -s -X PATCH "http://localhost:3000/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"speccing"}' | jq .status
# Expected: "speccing"

curl -s -X PATCH "http://localhost:3000/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"idea"}' | jq .status
# Expected: "speccing" (no backwards movement)

curl -s -X PATCH "http://localhost:3000/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Watch out for X"}' | jq .notes
# Expected: "Watch out for X"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/tasks/[id]/route.ts
git commit -m "feat: add GET/PATCH /api/tasks/[id]"
```

---

### Task 6: Migration endpoint

**Files:**
- Create: `app/api/migrate/tasks/route.ts`

- [ ] **Step 1: Create app/api/migrate/tasks/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { readdirSync, existsSync } from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'
import { createTask, getTasksByProject, updateTask } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/db/tasks'

function getFileKey(filename: string): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '')
}

function listMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(dir, f))
}

function inferStatus(hasIdea: boolean, hasSpec: boolean, hasPlan: boolean): TaskStatus {
  if (hasPlan) return 'planning'
  if (hasSpec) return 'speccing'
  return 'idea'
}

export async function POST(req: NextRequest) {
  const { projectId } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const db = getDb()
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as {
    id: string; ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null; path: string
  } | undefined

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const resolve = (rel: string | null) =>
    rel ? path.resolve(project.path, rel) : null

  const ideasDir = resolve(project.ideas_dir)
  const specsDir = resolve(project.specs_dir)
  const plansDir = resolve(project.plans_dir)

  const ideaFiles = ideasDir ? listMdFiles(ideasDir) : []
  const specFiles = specsDir ? listMdFiles(specsDir) : []
  const planFiles = plansDir ? listMdFiles(plansDir) : []

  // Build key→path maps
  const ideaMap = new Map(ideaFiles.map(f => [getFileKey(path.basename(f)), f]))
  const specMap = new Map(specFiles.map(f => [getFileKey(path.basename(f)), f]))
  const planMap = new Map(planFiles.map(f => [getFileKey(path.basename(f)), f]))

  const allKeys = new Set([...ideaMap.keys(), ...specMap.keys(), ...planMap.keys()])

  // Check existing tasks to avoid duplicates
  const existing = getTasksByProject(db, projectId)
  const existingTitles = new Set(existing.map(t => t.title))

  let created = 0
  let skipped = 0

  for (const key of allKeys) {
    const title = key.replace(/-/g, ' ')
    if (existingTitles.has(title)) { skipped++; continue }

    const ideaFile = ideaMap.get(key) ?? null
    const specFile = specMap.get(key) ?? null
    const planFile = planMap.get(key) ?? null
    const status = inferStatus(!!ideaFile, !!specFile, !!planFile)

    const task = createTask(db, { id: randomUUID(), projectId, title })
    updateTask(db, task.id, { idea_file: ideaFile, spec_file: specFile, plan_file: planFile })
    if (status !== 'idea') {
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, task.id)
    }
    created++
  }

  return NextResponse.json({ created, skipped })
}
```

- [ ] **Step 2: Smoke test migration**

```bash
curl -s -X POST http://localhost:3000/api/migrate/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJ_ID"}' | jq .
# Expected: { "created": N, "skipped": 0 }

# Run again — idempotency check
curl -s -X POST http://localhost:3000/api/migrate/tasks \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJ_ID"}' | jq .
# Expected: { "created": 0, "skipped": N }
```

- [ ] **Step 3: Add "Run Migration" button to project settings API**

In `app/api/projects/[id]/settings/route.ts`, the migration endpoint is separate — no change needed. The UI button (Plan 2) will call `POST /api/migrate/tasks`.

- [ ] **Step 4: Commit**

```bash
git add app/api/migrate/tasks/route.ts
git commit -m "feat: add task migration endpoint"
```

---

### Task 7: Task context builder in prompts.ts

**Files:**
- Modify: `lib/prompts.ts`
- Test: `__tests__/lib/tasks.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `__tests__/lib/tasks.test.ts`:

```typescript
import { buildTaskContext, generateOutputPath } from '@/lib/prompts'
import type { Task } from '@/lib/db/tasks'
import { writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('buildTaskContext', () => {
  it('returns empty string for task with no files', () => {
    const task = { idea_file: null, spec_file: null, plan_file: null, notes: null } as Task
    expect(buildTaskContext(task)).toBe('')
  })

  it('includes idea file content when present', () => {
    const dir = path.join(tmpdir(), 'pc-test-' + Date.now())
    mkdirSync(dir, { recursive: true })
    const ideaPath = path.join(dir, 'idea.md')
    writeFileSync(ideaPath, '# My Idea\nDo the thing')
    const task = { idea_file: ideaPath, spec_file: null, plan_file: null, notes: null } as Task
    const ctx = buildTaskContext(task)
    expect(ctx).toContain('## Idea')
    expect(ctx).toContain('Do the thing')
  })

  it('includes notes when present', () => {
    const task = { idea_file: null, spec_file: null, plan_file: null, notes: 'Watch out for X' } as Task
    const ctx = buildTaskContext(task)
    expect(ctx).toContain('## Correction Notes')
    expect(ctx).toContain('Watch out for X')
  })
})

describe('generateOutputPath', () => {
  it('produces a dated slug path in the given dir', () => {
    const result = generateOutputPath('/tmp/ideas', 'My Feature Task')
    expect(result).toMatch(/^\/tmp\/ideas\/\d{4}-\d{2}-\d{2}-my-feature-task\.md$/)
  })

  it('slugifies special characters', () => {
    const result = generateOutputPath('/tmp/specs', 'Auth: JWT + Refresh')
    expect(result).toContain('auth-jwt-refresh')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: FAIL — `buildTaskContext` and `generateOutputPath` not exported from `lib/prompts.ts`.

- [ ] **Step 3: Add functions to lib/prompts.ts**

Add these exports to the bottom of `lib/prompts.ts`:

```typescript
import { readFileSync } from 'fs'
import type { Task } from '@/lib/db/tasks'

export function buildTaskContext(task: Pick<Task, 'idea_file' | 'spec_file' | 'plan_file' | 'notes'>): string {
  const sections: string[] = []

  if (task.idea_file) {
    try {
      const content = readFileSync(task.idea_file, 'utf8')
      sections.push(`## Idea\n${content}`)
    } catch {}
  }
  if (task.spec_file) {
    try {
      const content = readFileSync(task.spec_file, 'utf8')
      sections.push(`## Spec\n${content}`)
    } catch {}
  }
  if (task.plan_file) {
    try {
      const content = readFileSync(task.plan_file, 'utf8')
      sections.push(`## Plan\n${content}`)
    } catch {}
  }
  if (task.notes) {
    sections.push(`## Correction Notes\n${task.notes}`)
  }

  return sections.join('\n\n')
}

export function generateOutputPath(dir: string, taskTitle: string): string {
  const date = new Date().toISOString().split('T')[0]
  const slug = taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${dir}/${date}-${slug}.md`
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/lib/tasks.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts __tests__/lib/tasks.test.ts
git commit -m "feat: add buildTaskContext and generateOutputPath to prompts"
```

---

### Task 8: Session launcher — inject task context on launch

**Files:**
- Modify: `lib/session-manager.ts`

The current `SpawnOptions` has `sourceFile`, `userContext`, `correctionNote`. Add `taskId` and `outputPath` as optional fields, then build and prepend task context.

- [ ] **Step 1: Add taskId and outputPath to SpawnOptions**

In `lib/session-manager.ts`, find the `SpawnOptions` type definition and add two optional fields:

```typescript
type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
  correctionNote?: string
  taskId?: string        // ← add this
  outputPath?: string    // ← add this
}
```

- [ ] **Step 2: Inject task context in spawnSession**

In `spawnSession`, after the existing `userContext` is assembled but before `buildArgs()` is called, add:

```typescript
import { getTask } from '@/lib/db/tasks'
import { buildTaskContext } from '@/lib/prompts'
// (add to top of file alongside existing imports)

// Inside spawnSession, before buildArgs():
let taskContextBlock = ''
if (opts.taskId) {
  const db = getDb()
  const task = getTask(db, opts.taskId)
  if (task) {
    taskContextBlock = buildTaskContext(task)
    if (opts.outputPath) {
      taskContextBlock += `\n\n## Output Path\nWrite your output to: ${opts.outputPath}`
    }
  }
}

const fullContext = taskContextBlock
  ? `${taskContextBlock}\n\n---\n\n${opts.userContext}`
  : opts.userContext
```

Then pass `fullContext` instead of `opts.userContext` to `buildSessionContext()`.

- [ ] **Step 3: Store outputPath on session record for write-back**

`sessions` table doesn't have an `outputPath` column. Add a migration in `lib/db.ts`:

```typescript
try {
  db.exec('ALTER TABLE sessions ADD COLUMN output_path TEXT')
} catch {}
```

In `createSession()` in `lib/db.ts`, add `outputPath` to the INSERT:

```typescript
export function createSession(db: Database, opts: {
  id: string
  projectId: string
  label: string
  phase: string
  sourceFile: string | null
  taskId?: string
  outputPath?: string
}) {
  db.prepare(`
    INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, output_path, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(opts.id, opts.projectId, opts.label, opts.phase, opts.sourceFile ?? null, opts.taskId ?? null, opts.outputPath ?? null, new Date().toISOString())
}
```

- [ ] **Step 4: Pass taskId and outputPath when calling createSession in spawnSession**

Find the `createSession(db, { ... })` call in `spawnSession` and add:

```typescript
createSession(db, {
  id: sessionId,
  projectId: opts.projectId,
  label: opts.label,
  phase: opts.phase,
  sourceFile: opts.sourceFile,
  taskId: opts.taskId,      // ← add
  outputPath: opts.outputPath, // ← add
})
```

- [ ] **Step 5: Smoke test context injection**

Restart dev server. Launch a session that has a `taskId` set. Verify the PTY session receives the assembled context by checking the Claude prompt in the terminal window. You should see idea/spec/plan sections before the user's context.

- [ ] **Step 6: Commit**

```bash
git add lib/db.ts lib/session-manager.ts
git commit -m "feat: inject task context into session prompts"
```

---

### Task 9: Session launcher — write file refs back on session end

**Files:**
- Modify: `lib/session-manager.ts`

- [ ] **Step 1: Add write-back logic in session exit handler**

In `spawnSession`, find where `endSession(db, sessionId)` is called (the session exit handler). After ending the session, add:

```typescript
import { existsSync } from 'fs'
import { updateTask, advanceTaskStatus } from '@/lib/db/tasks'
import { getDebrief } from '@/lib/debrief'
// (add to top of file)

// After endSession(db, sessionId):
const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as {
  task_id: string | null
  output_path: string | null
  phase: string
} | undefined

if (session?.task_id) {
  const phaseToField: Record<string, 'idea_file' | 'spec_file' | 'plan_file'> = {
    ideate: 'idea_file',
    spec:   'spec_file',
    plan:   'plan_file',
  }
  const field = phaseToField[session.phase]

  if (field && session.output_path && existsSync(session.output_path)) {
    updateTask(db, session.task_id, { [field]: session.output_path })
  }

  // For develop sessions, set dev_summary to the debrief path if generated
  if (session.phase === 'develop') {
    const debriefPath = getDebriefPath(sessionId) // implement below
    if (debriefPath && existsSync(debriefPath)) {
      updateTask(db, session.task_id, { dev_summary: debriefPath })
    }
  }
}
```

- [ ] **Step 2: Add getDebriefPath helper**

In `lib/debrief.ts`, export a helper that returns the expected debrief path for a session:

```typescript
export function getDebriefPath(sessionId: string): string | null {
  // Debriefs are written to the same dir as the source file's log
  // Return null if not applicable — the write-back silently skips missing files
  const logDir = getLogDir(sessionId) // use whatever existing path logic debrief.ts uses
  if (!logDir) return null
  return path.join(logDir, `${sessionId}-debrief.md`)
}
```

Check `lib/debrief.ts` for the actual path construction pattern and match it exactly.

- [ ] **Step 3: Smoke test write-back**

1. Create a task via `POST /api/tasks`
2. Advance it to 'speccing' via `PATCH /api/tasks/[id]` with `{ status: 'speccing' }`
3. Launch a spec session with that `taskId` and an `outputPath` pointing to `{specs_dir}/{date}-test-task.md`
4. In the session, write a file to that exact path
5. Exit the session
6. `GET /api/tasks/[id]` — verify `spec_file` is now populated

- [ ] **Step 4: Commit**

```bash
git add lib/session-manager.ts lib/debrief.ts
git commit -m "feat: write artifact refs back to task on session end"
```

---

## Self-Review

**Spec coverage check:**
- ✅ tasks table with all columns
- ✅ sessions.task_id FK
- ✅ Task CRUD (create, read, list, update, advance status)
- ✅ Status advances forward only
- ✅ Tasks never deleted
- ✅ Migration endpoint — idempotent, scans dirs, key-matches files
- ✅ Context assembly — reads prior phase files, injects into prompt
- ✅ Output path injected into prompt
- ✅ File ref written back on session end
- ✅ dev_summary set from debrief on develop session end
- ✅ Phase re-entry doesn't change status

**Not in this plan (covered by Plan 2 — UI):**
- Task card design
- Three-panel layout / sidebar
- Task detail view
- Right drawer
- Phase views refactored to use tasks API
- New task modal
- /done route
