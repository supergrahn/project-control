# Next-Actions Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-carry-forward of prior session next_actions into the next session for the same originator, plus a one-click Continue button in the session drawer.

**Architecture:** Two pure helpers (`nextActionsContext.ts` for rendering, `findPriorSession.ts` for DB lookup) feed an injection step in `spawnSession`. A new API route `POST /api/sessions/[id]/continue` spawns the follow-up; the existing `SessionDetailDrawer` gets a Continue button.

**Tech Stack:** TypeScript, Next.js 16 (App Router), better-sqlite3, vitest, React 19, SWR, Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-05-next-actions-loop-design.md`

---

## File Structure

| File | Purpose |
|------|---------|
| `lib/sessions/nextActionsContext.ts` | NEW — pure renderer + parser, idempotent injection |
| `lib/sessions/findPriorSession.ts` | NEW — DB query helper |
| `lib/sessions/__tests__/nextActionsContext.test.ts` | NEW |
| `lib/sessions/__tests__/findPriorSession.test.ts` | NEW |
| `lib/session-manager.ts` | MODIFY — call helpers in `spawnSession` |
| `lib/__tests__/session-manager-next-actions.test.ts` | NEW — integration |
| `app/api/sessions/[id]/continue/route.ts` | NEW |
| `app/api/sessions/__tests__/continue.test.ts` | NEW |
| `components/sessions/SessionDetailDrawer.tsx` | MODIFY — Continue button |
| `components/sessions/__tests__/SessionDetailDrawer.test.tsx` | MODIFY — button tests |

---

## Task 1: Pure rendering + parsing helper

**Files:**
- Create: `lib/sessions/nextActionsContext.ts`
- Create: `lib/sessions/__tests__/nextActionsContext.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// lib/sessions/__tests__/nextActionsContext.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseNextActions,
  renderNextActionsContext,
  injectPriorNextActions,
  type ParsedNextActions,
} from '../nextActionsContext'
import type { Session } from '@/lib/db'

function makeSession(next_actions: string | null): Session {
  return { next_actions } as Session
}

const parsed: ParsedNextActions = {
  next_actions: ['add tests', 'document'],
  open_questions: ['is X needed?'],
  files_touched: [{ path: 'a.ts', change: 'modified' }],
  extracted_at: '2026-05-05T01:00:00.000Z',
  model: 'llama3',
}

describe('parseNextActions', () => {
  it('returns null when column is null', () => {
    expect(parseNextActions(makeSession(null))).toBeNull()
  })

  it('returns null when JSON is unparseable', () => {
    expect(parseNextActions(makeSession('{not-json'))).toBeNull()
  })

  it('returns null when next_actions is not an array', () => {
    expect(parseNextActions(makeSession(JSON.stringify({ next_actions: 'oops' })))).toBeNull()
  })

  it('returns parsed object on valid JSON', () => {
    const result = parseNextActions(makeSession(JSON.stringify(parsed)))
    expect(result).toEqual(parsed)
  })
})

describe('renderNextActionsContext', () => {
  it('includes marker, label, summary excerpt, steps, and questions', () => {
    const out = renderNextActionsContext({
      label: 'Spec session',
      summary: 'Wrote the helper.\nAlso updated tests.',
      parsed,
    })
    expect(out).toContain('<!-- next-actions:auto -->')
    expect(out).toContain('## Continuing from prior session')
    expect(out).toContain('**Spec session**')
    expect(out).toContain('Wrote the helper.')
    expect(out).not.toContain('Also updated tests.') // first line only
    expect(out).toContain('- add tests')
    expect(out).toContain('- document')
    expect(out).toContain('- is X needed?')
  })

  it('falls back to "(unlabeled)" for null/empty label', () => {
    const a = renderNextActionsContext({ label: null, summary: null, parsed })
    const b = renderNextActionsContext({ label: '', summary: null, parsed })
    expect(a).toContain('**(unlabeled)**')
    expect(b).toContain('**(unlabeled)**')
  })

  it('omits Open questions section when empty', () => {
    const out = renderNextActionsContext({
      label: 'l',
      summary: null,
      parsed: { ...parsed, open_questions: [] },
    })
    expect(out).not.toContain('Open questions')
  })

  it('omits Open next steps section when empty', () => {
    const out = renderNextActionsContext({
      label: 'l',
      summary: null,
      parsed: { ...parsed, next_actions: [] },
    })
    expect(out).not.toContain('Open next steps')
  })
})

describe('injectPriorNextActions', () => {
  it('returns originalContext unchanged when prior is null', () => {
    expect(injectPriorNextActions('user input', null)).toBe('user input')
  })

  it('returns originalContext unchanged when arrays are both empty', () => {
    expect(
      injectPriorNextActions('user input', {
        label: 'l',
        summary: null,
        parsed: { ...parsed, next_actions: [], open_questions: [] },
      }),
    ).toBe('user input')
  })

  it('prepends marker block above original input', () => {
    const out = injectPriorNextActions('user input', { label: 'l', summary: null, parsed })
    expect(out.startsWith('<!-- next-actions:auto -->')).toBe(true)
    expect(out).toContain('---\n\nuser input')
  })

  it('returns just the rendered block when originalContext is empty', () => {
    const out = injectPriorNextActions('', { label: 'l', summary: null, parsed })
    expect(out).toContain('<!-- next-actions:auto -->')
    expect(out.endsWith('---\n\n')).toBe(false)
  })

  it('is idempotent: second injection no-ops if marker is already present', () => {
    const once = injectPriorNextActions('user input', { label: 'l', summary: null, parsed })
    const twice = injectPriorNextActions(once, { label: 'l', summary: null, parsed })
    expect(twice).toBe(once)
  })
})
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run lib/sessions/__tests__/nextActionsContext.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

```ts
// lib/sessions/nextActionsContext.ts
import type { Session } from '@/lib/db'

export type ParsedNextActions = {
  next_actions: string[]
  open_questions: string[]
  files_touched: { path: string; change: string }[]
  extracted_at: string
  model: string
}

const MARKER = '<!-- next-actions:auto -->'

export function parseNextActions(session: Pick<Session, 'next_actions'>): ParsedNextActions | null {
  if (!session.next_actions) return null
  try {
    const parsed = JSON.parse(session.next_actions)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray((parsed as { next_actions?: unknown }).next_actions)) return null
    return parsed as ParsedNextActions
  } catch {
    return null
  }
}

export function renderNextActionsContext(prior: {
  label: string | null | undefined
  summary: string | null
  parsed: ParsedNextActions
}): string {
  const lines: string[] = [MARKER, '## Continuing from prior session']
  lines.push(`- Prior session: **${prior.label || '(unlabeled)'}**`)
  if (prior.summary) {
    const excerpt = prior.summary.split('\n')[0].slice(0, 200)
    lines.push(`- Last summary: ${excerpt}`)
  }
  if (prior.parsed.next_actions.length > 0) {
    lines.push('- Open next steps:')
    for (const a of prior.parsed.next_actions) lines.push(`  - ${a}`)
  }
  if (prior.parsed.open_questions.length > 0) {
    lines.push('- Open questions:')
    for (const q of prior.parsed.open_questions) lines.push(`  - ${q}`)
  }
  return lines.join('\n')
}

export function injectPriorNextActions(
  originalContext: string,
  prior: { label: string | null | undefined; summary: string | null; parsed: ParsedNextActions } | null,
): string {
  if (!prior) return originalContext
  if (originalContext.includes(MARKER)) return originalContext
  if (prior.parsed.next_actions.length === 0 && prior.parsed.open_questions.length === 0) return originalContext
  const rendered = renderNextActionsContext(prior)
  return originalContext.length > 0 ? `${rendered}\n\n---\n\n${originalContext}` : rendered
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run lib/sessions/__tests__/nextActionsContext.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/nextActionsContext.ts lib/sessions/__tests__/nextActionsContext.test.ts
git commit -m "feat(next-actions-loop): renderer + idempotent injection helper"
```

---

## Task 2: DB query helper

**Files:**
- Create: `lib/sessions/findPriorSession.ts`
- Create: `lib/sessions/__tests__/findPriorSession.test.ts`

- [ ] **Step 1: Write failing tests**

**Schema reminder for fixtures (verified against `lib/db.ts`):**
- `projects (id, name, path, created_at TEXT NOT NULL, ...)` — no `status` column at base; ignore status
- `sessions (id, project_id, label, phase, status DEFAULT 'active', source_file?, created_at TEXT NOT NULL, ended_at TEXT?, task_id?, next_actions?, summary?, ...)` — only `created_at` and `ended_at`, both ISO TEXT, **not** numeric `started_at`
- Use ISO date strings for both timestamp columns; relative ordering via lexical comparison works for ISO 8601

```ts
// lib/sessions/__tests__/findPriorSession.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb } from '@/lib/db'
import type Database from 'better-sqlite3'
import { findPriorSessionWithNextActions } from '../findPriorSession'

function nextActionsJson(next_actions: string[], open_questions: string[] = []): string {
  return JSON.stringify({
    next_actions,
    open_questions,
    files_touched: [],
    extracted_at: new Date().toISOString(),
    model: 'llama3',
  })
}

function insertProject(db: Database.Database, id: string) {
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, id, `/tmp/${id}`, new Date().toISOString())
}

function insertSession(db: Database.Database, opts: {
  id: string
  projectId: string
  status?: 'active' | 'ended' | 'failed'
  taskId?: string | null
  sourceFile?: string | null
  nextActions?: string | null
  createdAt?: string
  endedAt?: string | null
}) {
  const createdAt = opts.createdAt ?? new Date().toISOString()
  db.prepare(`INSERT INTO sessions
    (id, project_id, label, phase, status, source_file, task_id, next_actions, created_at, ended_at)
    VALUES (?, ?, ?, 'spec', ?, ?, ?, ?, ?, ?)`).run(
    opts.id,
    opts.projectId,
    `label-${opts.id}`,
    opts.status ?? 'ended',
    opts.sourceFile ?? null,
    opts.taskId ?? null,
    opts.nextActions ?? null,
    createdAt,
    opts.endedAt ?? null,
  )
}

describe('findPriorSessionWithNextActions', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb(':memory:')
    insertProject(db, 'p1')
  })

  it('returns null when neither taskId nor sourceFile provided', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['x']) })
    expect(findPriorSessionWithNextActions(db, {})).toBeNull()
  })

  it('matches by taskId', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['x']) })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s1')
  })

  it('matches by sourceFile', () => {
    insertSession(db, { id: 's1', projectId: 'p1', sourceFile: '/tmp/a.md', nextActions: nextActionsJson(['x']) })
    const found = findPriorSessionWithNextActions(db, { sourceFile: '/tmp/a.md' })
    expect(found?.id).toBe('s1')
  })

  it('sourceFile takes precedence when both provided', () => {
    insertSession(db, { id: 's-task', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['by-task']) })
    insertSession(db, { id: 's-file', projectId: 'p1', sourceFile: '/tmp/a.md', nextActions: nextActionsJson(['by-file']) })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1', sourceFile: '/tmp/a.md' })
    expect(found?.id).toBe('s-file')
  })

  it('excludes status="active" sessions', () => {
    insertSession(db, { id: 's-active', projectId: 'p1', status: 'active', taskId: 't1', nextActions: nextActionsJson(['x']) })
    expect(findPriorSessionWithNextActions(db, { taskId: 't1' })).toBeNull()
  })

  it('excludes sessions with null next_actions', () => {
    insertSession(db, { id: 's1', projectId: 'p1', taskId: 't1', nextActions: null })
    expect(findPriorSessionWithNextActions(db, { taskId: 't1' })).toBeNull()
  })

  it('walks past most-recent ended session if its arrays are empty', () => {
    insertSession(db, { id: 's-old', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['has-action']), createdAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z' })
    insertSession(db, { id: 's-new', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson([], []), createdAt: '2026-01-02T00:00:00.000Z', endedAt: '2026-01-02T00:01:00.000Z' })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s-old')
  })

  it('orders by ended_at DESC (most recent first)', () => {
    insertSession(db, { id: 's-old', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['a']), createdAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z' })
    insertSession(db, { id: 's-new', projectId: 'p1', taskId: 't1', nextActions: nextActionsJson(['b']), createdAt: '2026-01-02T00:00:00.000Z', endedAt: '2026-01-02T00:01:00.000Z' })
    const found = findPriorSessionWithNextActions(db, { taskId: 't1' })
    expect(found?.id).toBe('s-new')
  })
})
```

NOTE on excludeSessionId: an earlier draft of the spec listed an "excludes self via excludeSessionId" test. That parameter was removed because self-match is impossible — the calling session row is always `status='active'` at lookup time and the filter excludes that status. The spec text was updated to reflect this; do not add an `excludeSessionId` param to the helper.

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run lib/sessions/__tests__/findPriorSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helper**

```ts
// lib/sessions/findPriorSession.ts
import type { Database } from 'better-sqlite3'
import type { Session } from '@/lib/db'
import { parseNextActions } from './nextActionsContext'

export type PriorSessionLookup = { taskId?: string | null; sourceFile?: string | null }

export function findPriorSessionWithNextActions(db: Database, lookup: PriorSessionLookup): Session | null {
  const conditions: string[] = ["status != 'active'", 'next_actions IS NOT NULL']
  const params: unknown[] = []
  if (lookup.sourceFile) {
    conditions.push('source_file = ?')
    params.push(lookup.sourceFile)
  } else if (lookup.taskId) {
    conditions.push('task_id = ?')
    params.push(lookup.taskId)
  } else {
    return null
  }
  // ORDER: ended_at DESC NULLS LAST then created_at DESC. ISO 8601 strings sort
  // lexicographically the same as chronologically, so a plain DESC works. NULLs
  // last so a session that ended cleanly outranks one with no ended_at (e.g.
  // an interrupted session that is no longer 'active' but has no end timestamp).
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE ${conditions.join(' AND ')} ORDER BY ended_at IS NULL, ended_at DESC, created_at DESC LIMIT 5`,
    )
    .all(...params) as Session[]
  for (const row of rows) {
    const parsed = parseNextActions(row)
    if (parsed && (parsed.next_actions.length > 0 || parsed.open_questions.length > 0)) return row
  }
  return null
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run lib/sessions/__tests__/findPriorSession.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/findPriorSession.ts lib/sessions/__tests__/findPriorSession.test.ts
git commit -m "feat(next-actions-loop): findPriorSessionWithNextActions helper"
```

---

## Task 3: Wire into spawnSession

**Files:**
- Modify: `lib/session-manager.ts:174-260` (the `spawnSession` function — adds 5 lines after the existing `prepUserContext` call at ~line 191)
- Create: `lib/__tests__/session-manager-next-actions.test.ts`

- [ ] **Step 1: Read the canonical mock setup**

Read: `lib/__tests__/session-manager-provider.test.ts` lines 1-50. This is the established pattern this test must follow:
- Mock `child_process` so `spawn` returns an EventEmitter
- Mock `@/lib/db` with `actual.initDb(':memory:')` seeded inside the factory; export a `getDb: () => db` override along with selective overrides for `createSession`, `endSession`, `getActiveSessionForFile`, `getProject`, `listContextPacks`
- Mock `@/lib/events`, `@/lib/prompts`, `@/lib/db/tasks`, `@/lib/git`, `@/lib/frontmatter`, `@/lib/db/sessionEvents`

The new test file extends that pattern by:
- NOT stubbing `getActiveSessionForFile` (or stubbing it conditionally) so the carry-forward query against the real seeded DB works
- Inserting prior session rows directly via `db.prepare(...)` inside each test
- Asserting `db.prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId)` after spawn

The reason `getDb` must be seeded INSIDE the mock factory (not via a `let testDb` referenced from outside): Vitest hoists `vi.mock` calls above all module-scope statements, so a closure over an outer `let` variable will read `undefined` when the factory runs at hoist time.

- [ ] **Step 2: Write failing integration tests**

Schema fixtures (verified against `lib/db.ts`):
- `projects(id, name, path, created_at TEXT)` — no `status` column at base
- `providers(id, name TEXT NOT NULL, type, command, config?, is_active INTEGER DEFAULT 1, created_at TEXT)` — required: `id`, `name`, `type`, `command`, `created_at`. `is_active` defaults to 1
- `sessions(id, project_id, label, phase, status DEFAULT 'active', source_file?, created_at TEXT NOT NULL, ended_at?, task_id?, summary?, next_actions?, user_context?, permission_mode?, ...)` — `created_at` is ISO TEXT, NOT a numeric `started_at`
- `tasks(id, project_id, title, status DEFAULT 'idea', idea_file?, created_at TEXT, updated_at TEXT, prep_notes?, ...)` — there is **no `description` column**; `idea_file` is the closest analogue. `prep_notes` is a TEXT column added in migration 61

Skeleton (adapt to the canonical pattern):

```ts
// lib/__tests__/session-manager-next-actions.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return {
    ...actual,
    spawn: vi.fn(() => {
      const { EventEmitter } = require('events')
      const proc = new EventEmitter()
      proc.stdin = { writable: true, write: vi.fn() }
      proc.stdout = new EventEmitter()
      proc.stderr = new EventEmitter()
      proc.kill = vi.fn()
      proc.stdout.on = vi.fn()
      proc.stderr.on = vi.fn()
      // Resolve the spawn promise so the awaiter sees a successful spawn
      setImmediate(() => proc.emit('spawn'))
      return proc
    }),
  }
})

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  // Seed project + provider so spawnSession's resolveProvider succeeds
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test', '/tmp', new Date().toISOString())
  db.prepare(`INSERT INTO providers (id, name, type, command, is_active, created_at) VALUES (?, ?, 'claude', '/bin/echo', 1, ?)`)
    .run('pr1', 'mock', new Date().toISOString())
  return {
    ...actual,
    getDb: () => db,
    // Pass-throughs that bind to the seeded DB. We do NOT stub these to vi.fn,
    // because the carry-forward needs real reads/writes against `sessions`.
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
vi.mock('@/lib/frontmatter', () => ({ writeFrontmatter: vi.fn((c: string) => c) }))
vi.mock('@/lib/db/sessionEvents', () => ({
  insertSessionEvent: vi.fn(),
  getSessionEvents: vi.fn(() => []),
  flushSessionEvents: vi.fn(),
}))

import { getDb } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'

function nextActionsJson(next_actions: string[], open_questions: string[] = []) {
  return JSON.stringify({
    next_actions,
    open_questions,
    files_touched: [],
    extracted_at: new Date().toISOString(),
    model: 'llama3',
  })
}

function insertPriorSession(opts: { id?: string; taskId?: string | null; sourceFile?: string | null; nextActions?: string | null; summary?: string | null }) {
  const db = getDb()
  db.prepare(`INSERT INTO sessions
    (id, project_id, label, phase, status, source_file, task_id, summary, next_actions, created_at, ended_at)
    VALUES (?, 'p1', 'Prior label', 'spec', 'ended', ?, ?, ?, ?, ?, ?)`).run(
      opts.id ?? 'prior',
      opts.sourceFile ?? null,
      opts.taskId ?? null,
      opts.summary ?? 'prior summary',
      opts.nextActions ?? nextActionsJson(['follow up X']),
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:01:00.000Z',
  )
}

const baseOpts = {
  projectId: 'p1',
  projectPath: '/tmp',
  phase: 'spec' as const,
  sourceFile: null,
  agentId: null,
  permissionMode: 'default' as const,
  correctionNote: null,
  outputPath: null,
}

describe('spawnSession next-actions carry-forward', () => {
  it('injects prior next_actions when spawning for same taskId', async () => {
    insertPriorSession({ taskId: 't1' })
    const newId = await spawnSession({ ...baseOpts, label: 'New', taskId: 't1', userContext: 'do the thing' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).toContain('<!-- next-actions:auto -->')
    expect(row.user_context).toContain('follow up X')
    expect(row.user_context).toContain('do the thing')
  })

  it('does not inject when no prior session has next_actions', async () => {
    // Use a fresh task id so no prior is found in this DB instance
    const newId = await spawnSession({ ...baseOpts, label: 'New', taskId: 't-fresh', userContext: 'do the thing' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).not.toContain('<!-- next-actions:auto -->')
    expect(row.user_context).toContain('do the thing')
  })

  it('does not inject when prior session has empty arrays', async () => {
    insertPriorSession({ id: 'prior-empty', taskId: 't-empty', nextActions: nextActionsJson([], []) })
    const newId = await spawnSession({ ...baseOpts, label: 'New', taskId: 't-empty', userContext: 'do' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).not.toContain('<!-- next-actions:auto -->')
  })

  it('matches by source_file', async () => {
    insertPriorSession({ id: 'prior-file', sourceFile: '/tmp/a.md' })
    const newId = await spawnSession({ ...baseOpts, label: 'New', sourceFile: '/tmp/a.md', taskId: null, userContext: '' })
    const row = getDb().prepare('SELECT user_context FROM sessions WHERE id = ?').get(newId) as { user_context: string }
    expect(row.user_context).toContain('<!-- next-actions:auto -->')
  })
})
```

Notes for the implementer:
- The seeded DB persists ACROSS tests within this file (same module scope). If isolation is needed, add `beforeEach(() => getDb().exec('DELETE FROM sessions'))` and re-seed projects/providers if a previous test deleted them. The simpler path: use unique task_ids and session ids per test (as shown above) so no two tests collide.
- Skip the prep+next-actions-ordering test for now. It would require seeding a task with prep_notes and not stubbing `getTask`. Add it only if the simpler tests above are not sufficient evidence of correctness.
- `spawnSession` calls `resolveProvider` which reads providers from the DB. The seeded `providers` row covers it.
- `spawnSession` calls `fs.realpathSync(opts.sourceFile)` if `sourceFile` is non-null. The 4th test uses `/tmp/a.md` — ensure that path exists or that `realpathSync` is mocked. Simplest: `fs.writeFileSync('/tmp/a.md', '')` in a `beforeAll`. If realpathSync resolves differently than the literal path, the carry-forward query will miss; assert against the resolved path or use a path the test creates.

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run lib/__tests__/session-manager-next-actions.test.ts`
Expected: FAIL — `<!-- next-actions:auto -->` not found because the helpers are not yet wired into `spawnSession`.

- [ ] **Step 3: Wire helpers into spawnSession**

In `lib/session-manager.ts`, add imports at the top:

```ts
import { findPriorSessionWithNextActions } from './sessions/findPriorSession'
import { injectPriorNextActions, parseNextActions } from './sessions/nextActionsContext'
```

Then modify the body of `spawnSession` (existing line ~191):

Replace:
```ts
const enrichedContext = prepUserContext(db, opts.taskId, opts.userContext)
const enrichedOpts: SpawnOptions = { ...opts, userContext: enrichedContext }
```

With:
```ts
const prepped = prepUserContext(db, opts.taskId, opts.userContext)
const prior = findPriorSessionWithNextActions(db, {
  taskId: opts.taskId,
  sourceFile: canonical,
})
const parsed = prior ? parseNextActions(prior) : null
const enrichedContext = parsed
  ? injectPriorNextActions(prepped, { label: prior!.label, summary: prior!.summary, parsed })
  : prepped
const enrichedOpts: SpawnOptions = { ...opts, userContext: enrichedContext }
```

The `createSession` call below already uses `enrichedContext`, no change needed.

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run lib/__tests__/session-manager-next-actions.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: PASS — 1066 prior + ~24 new (12 + 8 + 4) tests = ~1090 total, all green.

- [ ] **Step 6: Commit**

```bash
git add lib/session-manager.ts lib/__tests__/session-manager-next-actions.test.ts
git commit -m "feat(next-actions-loop): inject prior next_actions in spawnSession"
```

---

## Task 4: Continue API route

**Files:**
- Create: `app/api/sessions/[id]/continue/route.ts`
- Create: `app/api/sessions/[id]/__tests__/continue.test.ts` (or `app/api/sessions/__tests__/continue.test.ts` — match existing test layout for sessions API)

- [ ] **Step 1: Write failing API tests**

Schema reminder (verified): the projects table has no `status` column at base; sessions has `created_at` (TEXT NOT NULL ISO) and no numeric `started_at`. Seed both with ISO strings.

```ts
// app/api/sessions/[id]/__tests__/continue.test.ts
import { describe, it, expect, vi } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so we don't depend on
// `let` initialization — vi.mock is hoisted above module-scope statements.
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run('p1', 'Test', '/tmp', new Date().toISOString())
  return { ...actual, getDb: () => db }
})

const spawnSessionMock = vi.fn(async () => 'new-session-id')
vi.mock('@/lib/session-manager', () => ({
  spawnSession: spawnSessionMock,
}))

import { getDb } from '@/lib/db'
import { POST } from '../route'

function clearSessions() {
  getDb().prepare('DELETE FROM sessions').run()
}

function insertSession(opts: {
  id: string
  status?: string
  taskId?: string | null
  sourceFile?: string | null
  label?: string | null
}) {
  // sessions.label is NOT NULL — pass an empty string when caller wants null label
  // semantics so the route's "(unlabeled)" / "session" fallback path can be exercised.
  const labelValue = opts.label === null ? '' : (opts.label ?? `lbl-${opts.id}`)
  getDb().prepare(
    `INSERT INTO sessions (id, project_id, label, phase, status, source_file, task_id, created_at)
     VALUES (?, 'p1', ?, 'spec', ?, ?, ?, ?)`,
  ).run(opts.id, labelValue, opts.status ?? 'ended', opts.sourceFile ?? null, opts.taskId ?? null, new Date().toISOString())
}

function makeRequest() {
  return new Request('http://test/api/sessions/x/continue', { method: 'POST' })
}

describe('POST /api/sessions/[id]/continue', () => {
  beforeEach(() => {
    clearSessions()
    spawnSessionMock.mockReset()
    spawnSessionMock.mockResolvedValue('new-session-id')
  })

  it('returns 404 when session not found', async () => {
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when source has no originator', async () => {
    insertSession({ id: 's1' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when active session exists for same task_id', async () => {
    insertSession({ id: 's1', taskId: 't1', status: 'ended' })
    insertSession({ id: 's-active', taskId: 't1', status: 'active' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(409)
    expect(spawnSessionMock).not.toHaveBeenCalled()
  })

  it('returns 409 when spawnSession throws CONCURRENT_SESSION (source_file collision)', async () => {
    insertSession({ id: 's1', sourceFile: '/tmp/a.md', status: 'ended' })
    spawnSessionMock.mockRejectedValue(new Error('CONCURRENT_SESSION:already-running'))
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.existingId).toBe('already-running')
  })

  it('200 with new sessionId on success and "Continuation:" prefix on label', async () => {
    insertSession({ id: 's1', taskId: 't1', label: 'Original', status: 'ended' })
    const res = await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBe('new-session-id')
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: Original' }))
  })

  it('does not double-prefix labels that already start with "Continuation: "', async () => {
    insertSession({ id: 's1', taskId: 't1', label: 'Continuation: Original', status: 'ended' })
    await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: Original' }))
  })

  it('falls back when label is empty', async () => {
    insertSession({ id: 's1', taskId: 't1', label: null, status: 'ended' })
    await POST(makeRequest(), { params: Promise.resolve({ id: 's1' }) })
    expect(spawnSessionMock).toHaveBeenCalledWith(expect.objectContaining({ label: 'Continuation: session' }))
  })
})
```

Schema note: `sessions.label TEXT NOT NULL` so we cannot insert a true SQL NULL — use an empty string when testing the fallback path. The route's truthy check (`source.label || 'session'`) handles both empty string and null identically.

- [ ] **Step 2: Run tests, expect FAIL**

Run: `npx vitest run app/api/sessions/[id]/__tests__/continue.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement route**

```ts
// app/api/sessions/[id]/continue/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'
import { getProject } from '@/lib/db'
import type { Session, SessionPhase } from '@/lib/db'
import type { SpawnOptions } from '@/lib/session-manager'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const source = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined
  if (!source) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (!source.task_id && !source.source_file) {
    return NextResponse.json({ error: 'session has no originator (task_id or source_file)' }, { status: 400 })
  }
  const project = getProject(db, source.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  // Pre-empt task_id collision (spawnSession only natively guards source_file)
  if (source.task_id) {
    const activeForTask = db
      .prepare(`SELECT id FROM sessions WHERE task_id = ? AND status = 'active' LIMIT 1`)
      .get(source.task_id) as { id: string } | undefined
    if (activeForTask) {
      return NextResponse.json(
        { error: 'a session for this task is already active', existingId: activeForTask.id },
        { status: 409 },
      )
    }
  }

  const label = source.label?.startsWith('Continuation: ')
    ? source.label
    : `Continuation: ${source.label || 'session'}`

  try {
    const newId = await spawnSession({
      projectId: source.project_id,
      projectPath: project.path,
      label,
      phase: source.phase as SessionPhase,
      sourceFile: source.source_file,
      taskId: source.task_id,
      agentId: source.agent_id,
      userContext: '',
      permissionMode: (source.permission_mode as SpawnOptions['permissionMode']) ?? 'default',
      correctionNote: null,
      outputPath: null,
    })
    return NextResponse.json({ sessionId: newId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('CONCURRENT_SESSION:')) {
      return NextResponse.json(
        { error: 'a session for this file is already active', existingId: message.split(':')[1] },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

NOTE: The `agent_id`/`source.agent_id` field may be named differently — check `Session` type in `lib/db.ts`. If the type uses `agent_id: string | null`, the spawn call should use `agentId: source.agent_id ?? undefined` if `SpawnOptions['agentId']` is `string | undefined`. Adjust to match.

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run app/api/sessions/[id]/__tests__/continue.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/api/sessions/\[id\]/continue/ app/api/sessions/\[id\]/__tests__/continue.test.ts
git commit -m "feat(next-actions-loop): POST /api/sessions/[id]/continue"
```

---

## Task 5: Continue button in SessionDetailDrawer

**Files:**
- Modify: `components/sessions/SessionDetailDrawer.tsx` (existing `NextActionsSection`)
- Modify: `components/sessions/__tests__/SessionDetailDrawer.test.tsx`

- [ ] **Step 1: Read the existing component + test**

Read: `components/sessions/SessionDetailDrawer.tsx` (find `NextActionsSection` — currently lines around 186-228 of the file). Note that `Session` type is imported from `@/hooks/useSessions`, not `@/lib/db`.

Read: `components/sessions/__tests__/SessionDetailDrawer.test.tsx` lines 1-50 (mock setup, `baseSession`, `wrap()` helper) and lines around 155-200 (existing next_actions tests). Note the established conventions:
- Component is rendered via `wrap(<SessionDetailDrawer session={...} sessions={...} onClose={vi.fn()} onNavigate={vi.fn()} />)`
- `next/navigation` is **not** currently mocked — the new tests must add this mock at the top of the file
- All hooks are mocked at module top level via `vi.mock(...)` factories

For new button styling, use existing UI tokens. Find a similar primary action button (e.g. inside `LiveRunsSection.tsx`, `RightDrawer.tsx`, or `SessionInput.tsx`) and copy its class string verbatim — do NOT invent token names.

- [ ] **Step 2: Add `next/navigation` mock to the existing test file**

At the top of the file, alongside the other `vi.mock` blocks (around line 32):

```ts
const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}))
```

And reset between tests:
```ts
beforeEach(() => { killMutate.mockClear(); openWindowSpy.mockClear(); pushSpy.mockClear() })
```

- [ ] **Step 3: Write failing tests**

Append to `components/sessions/__tests__/SessionDetailDrawer.test.tsx`:

```tsx
describe('NextActionsSection Continue button', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'new-id' }), { status: 200 }),
    )
  })

  afterEach(() => { fetchSpy.mockRestore() })

  function withNextActions(extra: Partial<Session> = {}): Session {
    return {
      ...baseSession,
      next_actions: JSON.stringify({
        next_actions: ['do X'],
        open_questions: [],
        files_touched: [],
        extracted_at: 'x',
        model: 'm',
      }),
      ...extra,
    } as Session
  }

  it('renders Continue button when next_actions and task_id are present', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ task_id: 't1' })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('renders Continue button when next_actions and source_file are present', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ source_file: '/tmp/a.md' })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('hides Continue button when session has no originator', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ task_id: null, source_file: null })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('hides Continue button when next_actions array is empty', () => {
    const empty = {
      ...baseSession,
      task_id: 't1',
      next_actions: JSON.stringify({
        next_actions: [], open_questions: [], files_touched: [], extracted_at: 'x', model: 'm',
      }),
    } as Session
    wrap(<SessionDetailDrawer session={empty} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('POSTs to /api/sessions/{id}/continue and navigates on success', async () => {
    const session = withNextActions({ id: 'sX', task_id: 't1' })
    wrap(<SessionDetailDrawer session={session} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/sessions/sX/continue', expect.objectContaining({ method: 'POST' }))
    })
    await vi.waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/sessions?selected=new-id')
    })
  })

  it('renders error message when API returns non-OK', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'a session for this task is already active' }), { status: 409 }),
    )
    const session = withNextActions({ id: 'sX', task_id: 't1' })
    wrap(<SessionDetailDrawer session={session} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(/already active/i)
  })
})
```

Notes:
- `Session` is the type imported at the top of the file from `@/hooks/useSessions`. If `task_id`/`next_actions` are not in that type yet, add them — they exist in the DB layer's `Session` type. Inspect `hooks/useSessions.ts` and add fields if needed.
- `vi.waitFor` is the project's preferred async-assertion helper here. If the test file already imports `waitFor` from `@testing-library/react`, use that instead.

- [ ] **Step 4: Run tests, expect FAIL**

Run: `npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx`
Expected: FAIL — Continue button not found.

- [ ] **Step 5: Implement the button**

In `components/sessions/SessionDetailDrawer.tsx`, modify the existing `NextActionsSection`:

```tsx
function NextActionsSection({ session }: { session: Session }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ... existing parse logic for `parsed` and `hasNext` ...
  const hasOriginator = !!(session.task_id || session.source_file)
  const canContinue = hasNext && hasOriginator

  async function handleContinue() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}/continue`, { method: 'POST' })
      const data = (await res.json()) as { sessionId?: string; error?: string }
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? 'failed to continue')
        return
      }
      router.push(`/sessions?selected=${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="...existing...">
      {/* ...existing list rendering... */}
      {canContinue && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleContinue}
            disabled={pending}
            aria-label="Continue this session"
            className="rounded border border-border-default bg-bg-elevated px-3 py-1 text-sm text-text-primary hover:bg-bg-hover disabled:opacity-60"
          >
            {pending ? 'Spawning…' : 'Continue →'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-status-failed">{error}</p>}
    </section>
  )
}
```

NOTE: The exact UI token classes vary by codebase. Match the closest existing primary action button (e.g. ones in `RightDrawer.tsx` or `LiveRunsSection.tsx`).

- [ ] **Step 6: Run tests, expect PASS**

Run: `npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx`
Expected: PASS — all new + existing tests green.

- [ ] **Step 7: Commit**

```bash
git add components/sessions/SessionDetailDrawer.tsx components/sessions/__tests__/SessionDetailDrawer.test.tsx
git commit -m "feat(next-actions-loop): Continue button in SessionDetailDrawer"
```

---

## Task 6: Full test run + production build verification

- [ ] **Step 1: Run full vitest suite**

Run: `npx vitest run`
Expected: PASS — all tests (~1066 + ~30 new = ~1096) green.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS — `✓ Compiled successfully` and no type errors.

- [ ] **Step 3: Smoke checklist file**

Create `docs/superpowers/specs/2026-05-05-next-actions-loop-smoke.md` with manual smoke steps:

```markdown
# Next-Actions Loop — Manual Smoke

1. Start dev server (`npm run dev`)
2. Spawn a session for any task or document
3. Let it run briefly, then end the session manually
4. Wait ~30s for the background `extract_next_actions` job to fire
5. Refresh, open the session drawer — verify Next-actions section renders
6. Verify Continue button appears (assuming next_actions array is non-empty)
7. Click Continue
   - Expected: drawer navigates to a new session selected in `?selected=...`
   - Expected: new session label is "Continuation: <original>"
   - Expected: new session's user_context (DB or rendered) contains `<!-- next-actions:auto -->`
8. Spawn a third session for the same task via sidebar (NOT via Continue)
   - Expected: that session also gets the carry-forward
9. Verify Continue button is NOT visible on a session with no originator (e.g. orchestrator phase)
10. Verify clicking Continue when an active session exists for the same task returns 409 (toast/alert in drawer)
```

- [ ] **Step 4: Commit smoke checklist**

```bash
git add docs/superpowers/specs/2026-05-05-next-actions-loop-smoke.md
git commit -m "docs(next-actions-loop): manual smoke checklist"
```

---

## Self-Review Checklist (controller does this before dispatching tasks)

- [ ] **Spec coverage:** Every spec section maps to a task. ✓ (Helpers → T1+T2, spawnSession wiring → T3, API → T4, UI → T5, smoke → T6)
- [ ] **Placeholder scan:** No "TBD"/"TODO". The two NOTE blocks (T3 mock pattern, T5 UI tokens) are explicit instructions to the implementer to consult existing patterns — not placeholders.
- [ ] **Type consistency:** `findPriorSessionWithNextActions` returns `Session | null`; `parseNextActions` accepts `Pick<Session, 'next_actions'>`; `injectPriorNextActions` signature consistent across spec and plan. Verified `Session.label` is `string` (NOT NULL) and `Session.source_file`/`Session.agent_id` are `string | null`. Continue route's "(unlabeled)" / "session" fallbacks are defensive only — schema guarantees label is a string.

- [ ] **Next.js conventions:** Route handlers use `(req: Request, { params }: { params: Promise<{ id: string }> })` per `app/api/sessions/[id]/restart-with-route/route.ts` (Next.js 16 — params is a Promise). Implementer should consult `node_modules/next/dist/docs/` if any other Next-specific API surfaces.
