# Session Summary + Originator Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At session-end, capture the agent's last assistant message into `sessions.summary`. Then surface bidirectional links: docs/tasks list their sessions with summaries, drawer/grid card show "From X" originator links.

**Architecture:** Migration 64 (add `summary` column) + capture point in `lib/session-manager.ts` between `endSession` and `flushSessionEvents`. Pure helper `getSessionOriginator` produces a tagged union; UI components consume it. New API endpoint for docs-page sessions list. **`source_file` keeps its existing absolute storage format**; the originator helper and the docs-sessions API handle relative↔absolute conversion at their respective boundaries.

**Tech Stack:** Next.js 16, React 19, better-sqlite3, TanStack Query, vitest.

**Reference docs (must read before coding):**
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — `useSearchParams` requires `<Suspense>` for production builds. We add this requirement to the docs page in Task 4.

**Spec:** `docs/superpowers/specs/2026-05-02-session-summary-design.md` — read before each task.

---

## Task 1: Migration 64 + Session-type extensions

**Files:**
- Modify: `lib/db.ts` (add migration 64, extend server `Session` type)
- Modify: `hooks/useSessions.ts` (extend client `Session` type)
- Create: `tests/db/sessions-summary-migration.test.ts`

Foundational task. Tests verify migration applies on fresh DB and that summary can be written/read.

- [ ] **Step 1: Write the failing test**

Create `tests/db/sessions-summary-migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'

describe('migration 64 — sessions.summary column', () => {
  it('adds summary as a nullable TEXT column', () => {
    const db = initDb(':memory:')
    const cols = db.prepare(`PRAGMA table_info(sessions)`).all() as { name: string; type: string; notnull: number }[]
    const summary = cols.find(c => c.name === 'summary')
    expect(summary).toBeDefined()
    expect(summary!.type).toBe('TEXT')
    expect(summary!.notnull).toBe(0)
  })

  it('allows writing and reading summary on an existing session row', () => {
    const db = initDb(':memory:')
    const projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    const sessionId = randomUUID()
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, projectId, 'L', 'spec', null, 'ended', new Date().toISOString(), new Date().toISOString())
    db.prepare(`UPDATE sessions SET summary = ? WHERE id = ?`).run('hello', sessionId)
    const row = db.prepare(`SELECT summary FROM sessions WHERE id = ?`).get(sessionId) as { summary: string }
    expect(row.summary).toBe('hello')
  })

  it('defaults summary to NULL on inserts that don\'t set it', () => {
    const db = initDb(':memory:')
    const projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
    const sessionId = randomUUID()
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, projectId, 'L', 'spec', null, 'active', new Date().toISOString(), null)
    const row = db.prepare(`SELECT summary FROM sessions WHERE id = ?`).get(sessionId) as { summary: string | null }
    expect(row.summary).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/db/sessions-summary-migration.test.ts
```

Expected: FAIL — `summary` column doesn't exist.

- [ ] **Step 3: Add migration 64 + extend `Session` types**

In `lib/db.ts`:

1. **Add migration 64** directly after migration 63:

```ts
runMigration(db, 64, 'sessions_summary', `ALTER TABLE sessions ADD COLUMN summary TEXT`, true)
```

2. **Read the current server `Session` type at `lib/db.ts:31-45`** before editing to learn its exact shape (it may already include `output_path`, `correction_note`, `permission_mode`, `user_context` etc. from prior migrations — leave those untouched). Add the THREE new fields:

```ts
// Add these THREE lines to the existing Session type literal:
task_id: string | null      // NEW
agent_id: string | null     // NEW
summary: string | null      // NEW
```

The other fields (`output_path`, `user_context`, etc.) may already exist — do not duplicate them. The columns for `task_id` (migration 20), `agent_id` (migration 24), and `summary` (migration 64) all exist; `getAllSessions` already does `SELECT *` so the runtime values are already returned — only the type literal is missing.

3. **Extend the client `Session` type** at `hooks/useSessions.ts:3-13`:

```ts
export type Session = {
  id: string
  project_id: string
  label: string
  phase: string
  source_file: string | null
  task_id?: string | null         // NEW (optional for back-compat with mock-construction in tests)
  agent_id?: string | null        // NEW
  status: string
  created_at: string
  ended_at: string | null
  exit_reason?: string | null
  summary?: string | null         // NEW
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run tests/db/sessions-summary-migration.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full suite to confirm no regressions**

```
npx vitest run
```

Expected: 962 prior + 4 new = 966 passing. If any existing test breaks because of the type changes (e.g. a `Session` mock missing `task_id`), the optional `?:` modifier should prevent it. If a strict mock construction breaks, fix the mock — don't widen back.

- [ ] **Step 6: Commit**

```
git add lib/db.ts hooks/useSessions.ts tests/db/sessions-summary-migration.test.ts
git commit -m "feat(sessions): add summary column + normalize source_file to relative"
```

---

## Task 2: Capture summary at session-end

**Files:**
- Create: `lib/sessions/captureSummary.ts`
- Modify: `lib/session-manager.ts` (add capture call between `endSession` and `flushSessionEvents`)
- Create: `tests/sessions/summary-capture.test.ts`

**No API changes.** `app/api/sessions/route.ts` continues to store `source_file` as absolute. `spawnSession`, `respawnSessionWithProvider`, and `getActiveSessionForFile` are untouched.

- [ ] **Step 1: Write the failing test for capture**

Create `tests/sessions/summary-capture.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { insertSessionEvent } from '@/lib/db/sessionEvents'
import { captureSessionSummary } from '@/lib/sessions/captureSummary'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

let db: Database
let projectId: string
let sessionId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
  sessionId = randomUUID()
  db.prepare(
    `INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, projectId, 'L', 'spec', null, 'ended', new Date().toISOString(), new Date().toISOString())
})

describe('captureSessionSummary', () => {
  it('writes the last non-empty assistant content to sessions.summary', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'user', content: 'hi' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'first response' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'final wrap-up message' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBe('final wrap-up message')
  })

  it('walks back past empty/whitespace-only assistant content', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: 'real text' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: '' })
    insertSessionEvent(db, sessionId, { type: 'message', role: 'assistant', content: '   \n  ' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBe('real text')
  })

  it('leaves summary NULL when no assistant events exist', () => {
    insertSessionEvent(db, sessionId, { type: 'message', role: 'user', content: 'only user input' })
    captureSessionSummary(db, sessionId)
    const row = db.prepare('SELECT summary FROM sessions WHERE id = ?').get(sessionId) as { summary: string | null }
    expect(row.summary).toBeNull()
  })

  it('does not throw on DB error (try/catch logs and continues)', () => {
    // Pass a closed DB to provoke an error
    db.close()
    expect(() => captureSessionSummary(db, sessionId)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/sessions/summary-capture.test.ts
```

Expected: FAIL — `captureSessionSummary` doesn't exist.

- [ ] **Step 3: Implement `captureSessionSummary`**

Create `lib/sessions/captureSummary.ts`:

```ts
import type { Database } from 'better-sqlite3'

export function captureSessionSummary(db: Database, sessionId: string): void {
  try {
    const lastAssistant = db.prepare(`
      SELECT content FROM session_events
      WHERE session_id = ?
        AND role = 'assistant'
        AND content IS NOT NULL
        AND TRIM(content) != ''
      ORDER BY id DESC LIMIT 1
    `).get(sessionId) as { content: string } | undefined
    if (lastAssistant?.content) {
      db.prepare('UPDATE sessions SET summary = ? WHERE id = ?').run(lastAssistant.content, sessionId)
    }
  } catch (err) {
    console.warn('failed to capture session summary for', sessionId, err)
  }
}
```

- [ ] **Step 4: Wire it into `lib/session-manager.ts`**

Find the session-end handler at `lib/session-manager.ts:454-486`. Insert the call between `endSession(getDb(), sessionId)` (around line 457) and the existing `flushSessionEvents` call (around line 484). The exact location is BEFORE the flush because flush deletes the events.

Add the import at top of file:
```ts
import { captureSessionSummary } from './sessions/captureSummary'
```

In the handler, add:
```ts
// Capture last assistant message as summary BEFORE flushSessionEvents deletes events
captureSessionSummary(getDb(), sessionId)
```

Place it directly after the `endSession(getDb(), sessionId)` line (before the agent/task artifact updates and well before the flush).

- [ ] **Step 5: Run capture tests + full suite**

```
npx vitest run tests/sessions/summary-capture.test.ts
npx vitest run
```

Expected: all 4 capture tests pass. Full suite stays green.

- [ ] **Step 6: Commit**

```
git add lib/sessions/captureSummary.ts lib/session-manager.ts tests/sessions/summary-capture.test.ts
git commit -m "feat(sessions): capture last assistant message as summary at session-end"
```

(No source_file storage changes; absolute paths kept as-is, conversion happens at API boundaries in later tasks.)
```

---

## Task 3: `getSessionOriginator` helper

**Files:**
- Create: `lib/sessions/originator.ts`
- Create: `tests/sessions/originator.test.ts`

Pure helper, no I/O. Returns a tagged union per the spec's §2.

- [ ] **Step 1: Write the failing test**

Create `tests/sessions/originator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getSessionOriginator } from '@/lib/sessions/originator'

const PROJECT_PATH = '/home/user/myproject'
const baseSession = { project_id: 'proj-1', source_file: null }
const tasks = [{ id: 'task-1', title: 'Build feature' }]

describe('getSessionOriginator', () => {
  it('returns kind=task with doc sub-link when both task_id and source_file are set', () => {
    const r = getSessionOriginator(
      { ...baseSession, task_id: 'task-1', source_file: '/home/user/myproject/specs/foo.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.task.label).toBe('Build feature')
    expect(r.task.href).toBe('/projects/proj-1/tasks/task-1')
    expect(r.doc).not.toBeNull()
    expect(r.doc!.label).toBe('foo.md')
    expect(r.doc!.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('returns kind=task with null doc when only task_id is set', () => {
    const r = getSessionOriginator({ ...baseSession, task_id: 'task-1' }, { tasks, projectPath: PROJECT_PATH })
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.doc).toBeNull()
  })

  it('falls back to truncated task id when task missing from lookups', () => {
    const r = getSessionOriginator({ ...baseSession, task_id: 'task-deleted-123' }, { tasks, projectPath: PROJECT_PATH })
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.task.label).toBe('Task task-del')
  })

  it('returns kind=doc with relative-form href when only source_file set', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: '/home/user/myproject/specs/foo.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    expect(r.kind).toBe('doc')
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.label).toBe('foo.md')
    expect(r.doc.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('falls back to as-stored when projectPath is missing', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: 'specs/foo.md' },
      { tasks }
    )
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('returns kind=agent when only agent_id is set', () => {
    const r = getSessionOriginator({ ...baseSession, agent_id: 'agt-1' }, { tasks })
    expect(r.kind).toBe('agent')
    if (r.kind !== 'agent') throw new Error('narrowing')
    expect(r.agent.label).toBe('Agent')
    expect(r.agent.href).toBe('/projects/proj-1/agents/agt-1')
  })

  it('returns kind=standalone when nothing is set', () => {
    const r = getSessionOriginator(baseSession, { tasks })
    expect(r.kind).toBe('standalone')
  })

  it('takes basename for doc label even with deep path', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: '/home/user/myproject/a/b/c/deep.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.label).toBe('deep.md')
    expect(r.doc.href).toContain(encodeURIComponent('a/b/c/deep.md'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/sessions/originator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `lib/sessions/originator.ts`:

```ts
import type { Session } from '@/hooks/useSessions'

export type OriginatorLink = { label: string; href: string }

export type SessionOriginator =
  | { kind: 'task'; task: OriginatorLink; doc: OriginatorLink | null; taskId: string; sourceFile: string | null }
  | { kind: 'doc';  doc: OriginatorLink; sourceFile: string }
  | { kind: 'agent'; agent: OriginatorLink; agentId: string }
  | { kind: 'standalone' }

type SessionInput = Pick<Session, 'project_id' | 'source_file'> & {
  task_id?: string | null
  agent_id?: string | null
}

type Lookups = { tasks: Array<{ id: string; title: string }>; projectPath?: string }

function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

function toRelative(sourceFile: string, projectPath: string | undefined): string {
  if (!projectPath) return sourceFile
  const prefix = projectPath.endsWith('/') ? projectPath : projectPath + '/'
  return sourceFile.startsWith(prefix) ? sourceFile.slice(prefix.length) : sourceFile
}

function docLink(projectId: string, sourceFile: string, projectPath: string | undefined): OriginatorLink {
  const relative = toRelative(sourceFile, projectPath)
  return {
    label: basename(relative),
    href: `/projects/${projectId}/docs?file=${encodeURIComponent(relative)}`,
  }
}

export function getSessionOriginator(session: SessionInput, lookups: Lookups): SessionOriginator {
  const { project_id, source_file, task_id, agent_id } = session

  if (task_id) {
    const task = lookups.tasks.find(t => t.id === task_id)
    const taskLabel = task?.title ?? ('Task ' + task_id.slice(0, 8))
    return {
      kind: 'task',
      task: { label: taskLabel, href: `/projects/${project_id}/tasks/${task_id}` },
      doc: source_file ? docLink(project_id, source_file, lookups.projectPath) : null,
      taskId: task_id,
      sourceFile: source_file ?? null,
    }
  }
  if (source_file) {
    return {
      kind: 'doc',
      doc: docLink(project_id, source_file, lookups.projectPath),
      sourceFile: source_file,
    }
  }
  if (agent_id) {
    return {
      kind: 'agent',
      agent: { label: 'Agent', href: `/projects/${project_id}/agents/${agent_id}` },
      agentId: agent_id,
    }
  }
  return { kind: 'standalone' }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/sessions/originator.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```
git add lib/sessions/originator.ts tests/sessions/originator.test.ts
git commit -m "feat(sessions): add getSessionOriginator helper"
```

---

## Task 4: Docs page Sessions panel + `?file=` query param + new API endpoint

**Files:**
- Create: `app/api/projects/[id]/docs/sessions/route.ts`
- Create: `tests/api/docs-sessions.test.ts`
- Create: `components/docs/DocSessionsPanel.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/docs/page.tsx` (add `?file=` support + render the panel)

**Critical Next.js 16 note:** `useSearchParams` MUST be wrapped in `<Suspense>` (per the docs in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`). Pattern: `DocsPage` becomes a thin shell wrapping `DocsPageContent` in `<Suspense>`. Same pattern as the sessions-overview slice's page.

- [ ] **Step 1: Write the failing API test**

Create `tests/api/docs-sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { initDb, createProject } from '@/lib/db'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

import { getDb } from '@/lib/db'
import { GET } from '@/app/api/projects/[id]/docs/sessions/route'

let projectId: string

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM sessions').run()
  db.prepare('DELETE FROM projects').run()
  projectId = createProject(db, { name: 'P', path: '/tmp/p-' + randomUUID() })
})

function makeReq(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/projects/' + projectId + '/docs/sessions?' + new URLSearchParams(params))
  return new NextRequest(url)
}

describe('GET /api/projects/[id]/docs/sessions', () => {
  it('returns 400 when file query param missing', async () => {
    const res = await GET(makeReq({}), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(400)
  })

  it('returns sessions filtered by source_file (converted to absolute), newest first', async () => {
    const db = getDb()
    const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as { path: string }
    const projectPath = project.path
    const earlier = '2026-05-01T08:00:00.000Z'
    const later = '2026-05-02T08:00:00.000Z'
    const a = randomUUID()
    const b = randomUUID()
    // source_file is stored ABSOLUTE — the API converts the relative ?file= input to absolute.
    const fooAbs = projectPath + '/specs/foo.md'
    const otherAbs = projectPath + '/specs/other.md'
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a, projectId, 'first', 'spec', fooAbs, 'ended', earlier, earlier, 'first wrap-up')
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at, summary)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(b, projectId, 'second', 'spec', fooAbs, 'ended', later, later, 'second wrap-up')
    db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, status, created_at, ended_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), projectId, 'unrelated', 'spec', otherAbs, 'ended', later, later)

    const res = await GET(makeReq({ file: 'specs/foo.md' }), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ id: string; summary: string }>
    expect(body).toHaveLength(2)
    expect(body[0].id).toBe(b)  // newest first
    expect(body[1].id).toBe(a)
  })

  it('returns empty array for unknown file', async () => {
    const res = await GET(makeReq({ file: 'nope.md' }), { params: Promise.resolve({ id: projectId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/api/docs-sessions.test.ts
```

Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Implement the API route**

Create `app/api/projects/[id]/docs/sessions/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import type { Session } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const file = req.nextUrl.searchParams.get('file')
  if (!file) {
    return NextResponse.json({ error: 'file query param required' }, { status: 400 })
  }
  const db = getDb()
  const project = db.prepare('SELECT id, path FROM projects WHERE id = ?').get(projectId) as { id: string; path: string } | undefined
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  // source_file is stored absolute. Convert the relative ?file= input to absolute for the match.
  const prefix = project.path.endsWith('/') ? project.path : project.path + '/'
  const absoluteFile = prefix + file.replace(/^\/+/, '')
  const rows = db.prepare(
    `SELECT * FROM sessions
     WHERE project_id = ? AND source_file = ?
     ORDER BY created_at DESC`
  ).all(projectId, absoluteFile) as Session[]
  return NextResponse.json(rows)
}
```

- [ ] **Step 4: Run API test**

```
npx vitest run tests/api/docs-sessions.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Build `DocSessionsPanel` component**

Create `components/docs/DocSessionsPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { Session } from '@/hooks/useSessions'
import { formatDistanceToNow } from 'date-fns'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { projectId: string; relativePath: string }

export function DocSessionsPanel({ projectId, relativePath }: Props) {
  const router = useRouter()
  const { data: sessions = [], isLoading } = useSWR<Session[]>(
    `/api/projects/${projectId}/docs/sessions?file=${encodeURIComponent(relativePath)}`,
    fetcher,
  )

  if (isLoading) return null
  if (sessions.length === 0) {
    return (
      <div className="mt-8 pt-6 border-t border-border-default">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Sessions</h3>
        <p className="text-xs text-text-muted">No sessions yet for this doc.</p>
      </div>
    )
  }

  return (
    <div className="mt-8 pt-6 border-t border-border-default">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Sessions</h3>
      <div className="space-y-3">
        {sessions.map(s => (
          <SessionCard key={s.id} session={s} onOpen={() => router.push('/sessions?selected=' + s.id)} />
        ))}
      </div>
    </div>
  )
}

function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const startedRel = formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
  const endedRel = session.ended_at ? formatDistanceToNow(new Date(session.ended_at), { addSuffix: true }) : null

  let summarySlot: React.ReactNode
  if (isActive) summarySlot = <span className="text-text-muted text-xs italic">Session in progress…</span>
  else if (session.summary) summarySlot = (
    <div>
      <p className={`text-xs text-text-primary whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
        {session.summary}
      </p>
      {session.summary.split('\n').length > 3 && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }} className="text-[11px] text-accent-blue mt-1">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
  else summarySlot = <span className="text-text-faint text-xs italic">No final message captured.</span>

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="bg-bg-secondary border border-border-subtle rounded-lg p-3 cursor-pointer hover:border-border-hover transition"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
          {initials}
        </span>
        <span className="text-text-primary text-sm font-semibold flex-1 truncate">{session.label}</span>
        <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
          {isActive ? '● Live' : 'Finished'}
        </span>
      </div>
      <div className="text-text-muted text-[11px] mb-2">
        started {startedRel}
        <span className="mx-1.5 text-text-faint">·</span>
        {session.phase}
        {endedRel && (
          <>
            <span className="mx-1.5 text-text-faint">·</span>
            ended {endedRel}
          </>
        )}
      </div>
      {summarySlot}
      <div className="text-[11px] text-accent-blue mt-2">Open session →</div>
    </div>
  )
}
```

- [ ] **Step 6: Modify the docs page to add `?file=` support + mount the panel**

Modify `app/(dashboard)/projects/[projectId]/docs/page.tsx`:

1. Wrap the page in Suspense — convert the existing default export to a thin shell:

```tsx
export default function DocsPage() {
  return (
    <Suspense fallback={<div className="text-text-secondary text-sm">Loading docs...</div>}>
      <DocsPageContent />
    </Suspense>
  )
}

function DocsPageContent() {
  // ... existing content of the current default export, including useParams etc.
}
```

2. In `DocsPageContent`, add `useSearchParams` to read `file`:

```tsx
const searchParams = useSearchParams()
const fileQueryParam = searchParams.get('file')
```

3. Right after the existing `setSelected` initial state, add an effect that finds the matching node by `relativePath` when `fileQueryParam` changes and selects it:

```tsx
useEffect(() => {
  if (!fileQueryParam || !data) return
  // Walk the docs tree and find a file whose relativePath matches.
  function findFile(nodes: DocsTreeNode[]): DocsTreeNode | null {
    for (const node of nodes) {
      if (node.type === 'file' && node.relativePath === fileQueryParam) return node
      if (node.children) {
        const hit = findFile(node.children)
        if (hit) return hit
      }
    }
    return null
  }
  const match = findFile(data.nodes)
  if (match) setSelected(match)
}, [fileQueryParam, data])
```

4. Below the rendered markdown content for the selected file, mount the panel:

```tsx
{selected?.type === 'file' && (
  <DocSessionsPanel projectId={projectId} relativePath={selected.relativePath} />
)}
```

The exact placement is after the existing markdown render block for a selected file (find the `<ReactMarkdown ...>` rendering the doc body, and add the panel directly below it inside the same scrollable container).

- [ ] **Step 7: Verify**

```
npx vitest run tests/api/docs-sessions.test.ts
npx vitest run
npm run build 2>&1 | tail -10
```

Expected: API tests + full suite pass. Production build succeeds with no "Missing Suspense" errors.

- [ ] **Step 8: Commit**

```
git add app/api/projects/\[id\]/docs/sessions components/docs/DocSessionsPanel.tsx app/\(dashboard\)/projects/\[projectId\]/docs tests/api/docs-sessions.test.ts
git commit -m "feat(sessions): add Sessions panel to docs page with ?file= deep-link"
```

---

## Task 5: TaskDetailView "Past Sessions" section

**Files:**
- Create: `components/tasks/PastSessionsSection.tsx`
- Create: `components/tasks/__tests__/PastSessionsSection.test.tsx`
- Modify: `components/tasks/TaskDetailView.tsx` (mount the section below LiveRunsSection)

- [ ] **Step 1: Write the failing test**

Create `components/tasks/__tests__/PastSessionsSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/hooks/useSessions'

const pushSpy = vi.fn()
let mockSessions: Session[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({ data: mockSessions, isLoading: false }),
  useKillSession: () => ({ mutate: vi.fn() }),
}))

import { PastSessionsSection } from '../PastSessionsSection'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 's1', project_id: 'proj-1', label: 'Build feature', phase: 'developing',
  source_file: null, status: 'ended', created_at: '2026-05-02T10:00:00.000Z',
  ended_at: '2026-05-02T11:00:00.000Z', task_id: 'task-1', summary: 'wrap-up text',
}

describe('PastSessionsSection', () => {
  it('renders ended sessions for the task', () => {
    mockSessions = [baseSession]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText('wrap-up text')).toBeInTheDocument()
  })

  it('hides active sessions (no ended_at)', () => {
    mockSessions = [{ ...baseSession, ended_at: null, status: 'active' }]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.queryByText('Build feature')).not.toBeInTheDocument()
    expect(screen.getByText('No past sessions yet.')).toBeInTheDocument()
  })

  it('shows fallback when summary is null', () => {
    mockSessions = [{ ...baseSession, summary: null }]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('No final message captured.')).toBeInTheDocument()
  })

  it('clicking a card navigates to /sessions?selected=', () => {
    mockSessions = [baseSession]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    pushSpy.mockClear()
    fireEvent.click(screen.getByText('Build feature').closest('[role="button"]')!)
    expect(pushSpy).toHaveBeenCalledWith('/sessions?selected=s1')
  })

  it('only shows sessions for THIS task', () => {
    mockSessions = [
      baseSession,
      { ...baseSession, id: 's2', label: 'Other task work', task_id: 'task-2' },
    ]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.queryByText('Other task work')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run components/tasks/__tests__/PastSessionsSection.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `components/tasks/PastSessionsSection.tsx`. Reuse the `SessionCard` pattern from `DocSessionsPanel` — extract it to a shared file if it makes sense, but for v1 it's fine to duplicate the card body since the two surfaces have slightly different containers.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import type { Session } from '@/hooks/useSessions'
import { formatDistanceToNow } from 'date-fns'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { projectId: string; taskId: string }

export function PastSessionsSection({ projectId, taskId }: Props) {
  const router = useRouter()
  const { data: sessions = [], isLoading } = useSessions({ projectId, status: 'all' })
  const past = sessions.filter(s => s.task_id === taskId && !!s.ended_at)

  if (isLoading) return null

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Past Sessions</h3>
      {past.length === 0 ? (
        <p className="text-xs text-text-muted">No past sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {past.map(s => (
            <SessionCard key={s.id} session={s} onOpen={() => router.push('/sessions?selected=' + s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  // Identical to DocSessionsPanel's SessionCard — same body, same summary slot, same click handler
  // Copy the implementation verbatim from Task 4 Step 5.
  // (For brevity here; the implementer copies the SessionCard JSX.)
  const [expanded, setExpanded] = useState(false)
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const startedRel = formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
  const endedRel = session.ended_at ? formatDistanceToNow(new Date(session.ended_at), { addSuffix: true }) : null

  let summarySlot: React.ReactNode
  if (isActive) summarySlot = <span className="text-text-muted text-xs italic">Session in progress…</span>
  else if (session.summary) summarySlot = (
    <div>
      <p className={`text-xs text-text-primary whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
        {session.summary}
      </p>
      {session.summary.split('\n').length > 3 && (
        <button onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }} className="text-[11px] text-accent-blue mt-1">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
  else summarySlot = <span className="text-text-faint text-xs italic">No final message captured.</span>

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      className="bg-bg-secondary border border-border-subtle rounded-lg p-3 cursor-pointer hover:border-border-hover transition"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
          {initials}
        </span>
        <span className="text-text-primary text-sm font-semibold flex-1 truncate">{session.label}</span>
        <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
          {isActive ? '● Live' : 'Finished'}
        </span>
      </div>
      <div className="text-text-muted text-[11px] mb-2">
        started {startedRel}
        <span className="mx-1.5 text-text-faint">·</span>
        {session.phase}
        {endedRel && <><span className="mx-1.5 text-text-faint">·</span>ended {endedRel}</>}
      </div>
      {summarySlot}
      <div className="text-[11px] text-accent-blue mt-2">Open session →</div>
    </div>
  )
}
```

The duplication is intentional: forcing premature abstraction into a shared component before the second consumer is built is more risk than reward. After this task, if both components are stable, a follow-up PR can extract the shared `<SessionSummaryCard>`.

- [ ] **Step 4: Mount the section in TaskDetailView**

Modify `components/tasks/TaskDetailView.tsx`. Find the `<LiveRunsSection ... />` line (around line 118). Add directly below:

```tsx
<PastSessionsSection projectId={task.project_id} taskId={task.id} />
```

Add the import at the top of the file:

```tsx
import { PastSessionsSection } from '@/components/tasks/PastSessionsSection'
```

- [ ] **Step 5: Run tests**

```
npx vitest run components/tasks/__tests__/PastSessionsSection.test.tsx
npx vitest run
```

Expected: 5 PastSessionsSection tests pass; full suite stays green.

If existing `TaskDetailView.test.tsx` breaks because it doesn't mock `useSessions` for the new section, add the mock — same shape as the other tests.

- [ ] **Step 6: Commit**

```
git add components/tasks/PastSessionsSection.tsx components/tasks/TaskDetailView.tsx components/tasks/__tests__/PastSessionsSection.test.tsx
git commit -m "feat(sessions): add Past Sessions section to TaskDetailView"
```

---

## Task 6: SessionDetailDrawer + SessionGridCard "From X" lines

**Files:**
- Modify: `components/sessions/SessionDetailDrawer.tsx`
- Modify: `components/sessions/__tests__/SessionDetailDrawer.test.tsx`
- Modify: `components/sessions/SessionGridCard.tsx`
- Modify: `components/sessions/__tests__/SessionGridCard.test.tsx`

- [ ] **Step 1: Extend the drawer test**

Open `components/sessions/__tests__/SessionDetailDrawer.test.tsx`. Add a `vi.mock('@/hooks/useTasks', ...)` at the top:

```ts
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [{ id: 'task-1', title: 'Build feature' }], isLoading: false, error: null }),
}))
```

**Required mock edit:** the existing `useProjects` mock in `SessionDetailDrawer.test.tsx` returns `{ id: 'proj-1', name: 'My Project' }` with NO `path`. The originator helper needs `path` to compute the relative form for the doc href. Update the existing mock in that file to:

```ts
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project', path: '/home/user/myproject' }] }),
}))
```

Add tests inside the existing describe block (`baseSession` is already defined in the file):

```ts
it('renders "From <task>" link for task originator', () => {
  wrap(<SessionDetailDrawer
    session={{ ...baseSession, task_id: 'task-1' }}
    sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
  />)
  const link = screen.getByText(/Build feature/i).closest('a')
  expect(link).toHaveAttribute('href', '/projects/proj-1/tasks/task-1')
})

it('renders task + doc when both task_id and source_file set', () => {
  wrap(<SessionDetailDrawer
    session={{ ...baseSession, task_id: 'task-1', source_file: '/home/user/myproject/specs/foo.md' }}
    sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
  />)
  expect(screen.getByText(/via/)).toBeInTheDocument()
  expect(screen.getByText('foo.md')).toBeInTheDocument()
})

it('renders "From <doc>" link for doc-only originator', () => {
  wrap(<SessionDetailDrawer
    session={{ ...baseSession, source_file: '/home/user/myproject/docs/intro.md' }}
    sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
  />)
  const link = screen.getByText('intro.md').closest('a')
  expect(link?.getAttribute('href')).toContain('/projects/proj-1/docs?file=')
})

it('renders "From standalone" without link for standalone session', () => {
  wrap(<SessionDetailDrawer
    session={baseSession}
    sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
  />)
  expect(screen.getByText(/standalone/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx
```

Expected: 4 new tests fail (no "From X" rendered yet).

- [ ] **Step 3: Implement in the drawer**

Open `components/sessions/SessionDetailDrawer.tsx`. Add imports:

```tsx
import Link from 'next/link'
import { useTasks } from '@/hooks/useTasks'
import { useProjects } from '@/hooks/useProjects'
import { getSessionOriginator } from '@/lib/sessions/originator'
```

Inside the component, after the existing hook calls:

```tsx
const { tasks: allTasks = [] } = useTasks(session.project_id)
const { data: projects = [] } = useProjects()
const projectPath = projects.find(p => p.id === session.project_id)?.path
const originator = getSessionOriginator(session, { tasks: allTasks, projectPath })
```

(`useProjects` is already used by the drawer per the sessions-overview slice, so this is just one more value off the existing hook call. If a `projectPath` lookup helper exists, prefer that.)

Find the header label row (Row 2 per the previous slice's layout) and add a new line directly below it:

```tsx
<div className="px-4 py-1 text-[11px] text-text-muted border-b border-border-default shrink-0">
  {originator.kind === 'task' && (
    <>
      From <Link href={originator.task.href} className="text-accent-blue hover:underline">{originator.task.label}</Link>
      {originator.doc && (
        <> via <Link href={originator.doc.href} className="text-accent-blue hover:underline">{originator.doc.label}</Link></>
      )}
      {' '}<ExternalLink className="inline w-3 h-3" />
    </>
  )}
  {originator.kind === 'doc' && (
    <>From <Link href={originator.doc.href} className="text-accent-blue hover:underline">{originator.doc.label}</Link> <ExternalLink className="inline w-3 h-3" /></>
  )}
  {originator.kind === 'agent' && (
    <>From <Link href={originator.agent.href} className="text-accent-blue hover:underline">{originator.agent.label}</Link> <ExternalLink className="inline w-3 h-3" /></>
  )}
  {originator.kind === 'standalone' && (
    <span className="text-text-faint">From standalone</span>
  )}
</div>
```

`<ExternalLink />` is already imported in the drawer per the spec verification.

- [ ] **Step 4: Run drawer tests**

```
npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx
```

Expected: existing 8 + 4 new = 12 tests pass. If a test asserts on the dialog's exact content shape, update it to be looser (use `screen.getByText('Build feature')` etc.).

- [ ] **Step 5: Extend SessionGridCard test**

Open `components/sessions/__tests__/SessionGridCard.test.tsx`. Add `useTasks` mock:

```ts
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [{ id: 'task-1', title: 'Build feature' }], isLoading: false, error: null }),
}))
```

**Required mock edit:** the existing `useProjects` mock in this file also lacks a `path` field. Extend the existing mock to:

```ts
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project', path: '/home/user/myproject' }] }),
}))
```

Add tests:

```ts
it('renders "from <task>" segment for task originator', () => {
  wrap(<SessionGridCard session={{ ...baseSession, task_id: 'task-1' }} />)
  expect(screen.getByText(/from Build feature/i)).toBeInTheDocument()
})

it('renders "from <doc>" segment for doc originator', () => {
  wrap(<SessionGridCard session={{ ...baseSession, source_file: '/home/user/myproject/specs/foo.md' }} />)
  expect(screen.getByText(/from foo.md/i)).toBeInTheDocument()
})

it('omits originator segment for standalone session', () => {
  wrap(<SessionGridCard session={baseSession} />)
  expect(screen.queryByText(/from /i)).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Implement in the grid card**

Open `components/sessions/SessionGridCard.tsx`. Add imports:

```tsx
import { useTasks } from '@/hooks/useTasks'
import { getSessionOriginator } from '@/lib/sessions/originator'
```

Inside the component (note: `useProjects` is already imported; reuse its result for `projectPath`):

```tsx
const { tasks: allTasks = [] } = useTasks(session.project_id)
const projectPath = projects.find(p => p.id === session.project_id)?.path  // `projects` already destructured from existing useProjects() call
const originator = getSessionOriginator(session, { tasks: allTasks, projectPath })

let originatorLabel: string | null = null
if (originator.kind === 'task') originatorLabel = originator.task.label
else if (originator.kind === 'doc') originatorLabel = originator.doc.label
else if (originator.kind === 'agent') originatorLabel = originator.agent.label
// 'standalone' → null, segment omitted
```

In the meta row (currently `started <X> · <phase>`):

```tsx
<div className="text-text-muted text-[11px] mt-1.5">
  <span>started {startedRel}</span>
  <span className="mx-1.5 text-text-faint">·</span>
  <span>{session.phase}</span>
  {originatorLabel && (
    <>
      <span className="mx-1.5 text-text-faint">·</span>
      <span>from {originatorLabel}</span>
    </>
  )}
  {endedRel && (
    <>
      <span className="mx-1.5 text-text-faint">·</span>
      <span>ended {endedRel}</span>
    </>
  )}
</div>
```

- [ ] **Step 7: Run all tests**

```
npx vitest run components/sessions/__tests__/SessionGridCard.test.tsx
npx vitest run
```

Expected: SessionGridCard 5 + 3 new = 8 tests pass; full suite green.

- [ ] **Step 8: Commit**

```
git add components/sessions/SessionDetailDrawer.tsx components/sessions/SessionGridCard.tsx components/sessions/__tests__/
git commit -m "feat(sessions): show 'From X' originator on drawer and grid card"
```

---

## Task 7: E2E smoke + ship

**Files:**
- Create: `docs/superpowers/specs/2026-05-02-session-summary-smoke.md`

Verification-only task.

- [ ] **Step 1: Run full test suite**

```
cd /home/tomespen/git/project-control/.worktrees/session-summary
npx vitest run 2>&1 | tail -10
```

Expected: 962 prior + ~30 new = ~992+ tests pass.

- [ ] **Step 2: Run production build**

```
npm run build 2>&1 | tail -20
```

Expected: clean compile. No "Missing Suspense" errors. The docs page now has a Suspense wrapper, so this should pass.

- [ ] **Step 3: Write smoke checklist**

Save to `docs/superpowers/specs/2026-05-02-session-summary-smoke.md` — pull the 10 steps verbatim from the spec's "Smoke test" section. Add a "Run results" header at top with placeholders for date/operator/result.

- [ ] **Step 4: Commit**

```
git add docs/superpowers/specs/2026-05-02-session-summary-smoke.md
git commit -m "docs(sessions): add manual smoke checklist for session-summary slice"
```

- [ ] **Step 5: Final report**

Print test count, build status, smoke commit SHA, branch tip SHA, mergeability statement.

---

## Self-Review (controller runs after all tasks)

- All 7 tasks committed.
- Vitest suite green.
- Production build clean.
- Captured summary visible in Docs panel for a recently-ended session.
- "From X" line appears in drawer and grid card.
- Past Sessions section in TaskDetailView shows ended sessions.
- No regression in floating-window or session-overview behavior.
- Migration 64 added `summary` column on the dev DB (verified via `PRAGMA table_info(sessions)`).
- Originator helper is purely tested; no I/O dependency.
- No accidental edits to `lib/sessions/adapters/*`, `useSessionTerminal`, `useSessionWindows`, or unrelated files.

## Out-of-Scope Reminders (per spec)

- Do NOT teach the Ollama adapter to emit `role: 'assistant'`.
- Do NOT backfill summaries for historical sessions.
- Do NOT add a second LLM-pass summarization.
- Do NOT add agent-detail UI.
- Do NOT extract `<SessionSummaryCard>` shared component yet (Task 4 + 5 duplicate the card body deliberately).
