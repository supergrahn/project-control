# Next-Actions Loop Design

Close the feedback loop between sessions: when a session extracts `next_actions`, automatically carry that signal into the next session about the same originator (task or document). Plus a one-click **Continue** affordance to spawn that follow-up session directly from the session drawer.

## Why

The reflective-workflow slice already extracts `{next_actions, open_questions, files_touched}` at the end of every session and renders them in the drawer. Today that signal is read-only: the user has to remember the action items, manually start a new session, and re-explain the context. This slice closes the loop — same signal, automatically threaded into the next session for the same originator, plus a button that turns "I want to keep going on this" into one click.

## Scope

In:
- Automatic carry-forward of prior next_actions into a new session for the same originator (task_id or source_file)
- One-click **Continue** button in `SessionDetailDrawer` that spawns a continuation session
- Idempotent injection (respawn does not double-inject)

Out:
- Auto-spawning sessions without user click (cost concern — token spend without explicit consent)
- Marking individual next_actions as resolved/done (gilding — no obvious signal that an action was actually addressed)
- Walking back through multi-session chains (config-matrix smell — most-recent-only is the rule)
- Editing carry-forward content before injection (user can edit new session's user_context after spawn)
- Aggregating next_actions across all sessions into an inbox (handled in slice 2: briefing surface)

## Architecture

Two thin units, both following the existing `prepUserContext` precedent:

1. **Pure renderer** (`lib/sessions/nextActionsContext.ts`) — given parsed `next_actions` JSON, returns a markdown block prefixed with `<!-- next-actions:auto -->`. Idempotent injection wraps it the same way `prepUserContext` does.
2. **DB query helper** (`lib/sessions/findPriorSession.ts`) — given `{taskId?, sourceFile?}`, returns the most recent ENDED session row (`status != 'active'`) for that originator whose `next_actions` JSON parses and contains at least one open action.

`spawnSession` calls these after `prepUserContext`. A new API route `POST /api/sessions/[id]/continue` reads the originator from the source session and calls `spawnSession` with the same originator — the carry-forward fires automatically.

Marker order in `user_context`:

```
<!-- next-actions:auto -->
## Continuing from prior session
- Last summary excerpt: ...
- Open next steps:
  - ...
- Open questions:
  - ...

---

<!-- prep:auto -->
... prep packet ...

---

<original user input>
```

Next-actions block is most-specific (this thread of work) and goes at the top. The prep packet (general task context) follows. The user's own input is last. Both markers persist through respawn so neither double-injects.

## Components

### 1. `lib/sessions/nextActionsContext.ts` (NEW)

```ts
import type { Session } from '@/lib/db'

export type ParsedNextActions = {
  next_actions: string[]
  open_questions: string[]
  files_touched: { path: string; change: string }[]
  extracted_at: string
  model: string
}

const MARKER = '<!-- next-actions:auto -->'

export function parseNextActions(session: Session): ParsedNextActions | null {
  if (!session.next_actions) return null
  try {
    const parsed = JSON.parse(session.next_actions)
    if (!Array.isArray(parsed.next_actions)) return null
    return parsed as ParsedNextActions
  } catch { return null }
}

export function renderNextActionsContext(prior: { label: string; summary: string | null; parsed: ParsedNextActions }): string {
  const lines: string[] = [MARKER, '## Continuing from prior session']
  lines.push(`- Prior session: **${prior.label}**`)
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

export function injectPriorNextActions(originalContext: string, prior: { label: string; summary: string | null; parsed: ParsedNextActions } | null): string {
  if (!prior) return originalContext
  if (originalContext.includes(MARKER)) return originalContext
  if (prior.parsed.next_actions.length === 0 && prior.parsed.open_questions.length === 0) return originalContext
  const rendered = renderNextActionsContext(prior)
  return originalContext.length > 0
    ? `${rendered}\n\n---\n\n${originalContext}`
    : rendered
}
```

### 2. `lib/sessions/findPriorSession.ts` (NEW)

```ts
import type { Database } from 'better-sqlite3'
import type { Session } from '@/lib/db'
import { parseNextActions } from './nextActionsContext'

export type PriorSessionLookup = { taskId?: string | null; sourceFile?: string | null; excludeSessionId?: string | null }

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
  if (lookup.excludeSessionId) {
    conditions.push('id != ?')
    params.push(lookup.excludeSessionId)
  }
  const rows = db.prepare(`SELECT * FROM sessions WHERE ${conditions.join(' AND ')} ORDER BY ended_at DESC, started_at DESC LIMIT 5`).all(...params) as Session[]
  for (const row of rows) {
    const parsed = parseNextActions(row)
    if (parsed && (parsed.next_actions.length > 0 || parsed.open_questions.length > 0)) return row
  }
  return null
}
```

The `LIMIT 5` + walk loop covers the case where the most recent ended session has empty arrays (e.g. transient errors during extraction); we fall through to the next candidate. Capped at 5 to bound cost.

### 3. `lib/session-manager.ts` (MODIFY)

After the `prepUserContext` call inside `spawnSession`, add:

```ts
const enrichedContext = prepUserContext(db, opts.taskId, opts.userContext)
const prior = findPriorSessionWithNextActions(db, {
  taskId: opts.taskId,
  sourceFile: canonical,
})
const parsed = prior ? parseNextActions(prior) : null
const finalContext = parsed
  ? injectPriorNextActions(enrichedContext, { label: prior!.label, summary: prior!.summary, parsed })
  : enrichedContext
const enrichedOpts: SpawnOptions = { ...opts, userContext: finalContext }
```

Order in `finalContext`: next-actions block (most specific) first, then prep packet, then user's own input. Both markers are persisted in `sessions.user_context`, so respawn re-injection skips both.

`sourceFile` precedence over `taskId` is enforced in `findPriorSessionWithNextActions` (sourceFile branch takes the if-else first). Carry-forward only matches the SAME originator: a session about task A whose next_actions reference file X does NOT carry into a session about task B that touches file X. Same-task or same-source-file only.

### 4. `app/api/sessions/[id]/continue/route.ts` (NEW)

`POST /api/sessions/[id]/continue` — body `{ }` (empty for v1).

```ts
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const source = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined
  if (!source) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (!source.task_id && !source.source_file) {
    return NextResponse.json({ error: 'session has no originator (task_id or source_file)' }, { status: 400 })
  }
  const project = getProject(db, source.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  try {
    const newId = await spawnSession({
      projectId: source.project_id,
      projectPath: project.path,
      label: source.label.startsWith('Continuation: ') ? source.label : `Continuation: ${source.label}`,
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
      return NextResponse.json({ error: 'a session for this originator is already active', existingId: message.split(':')[1] }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
```

The new session's `userContext: ''` is intentional — the carry-forward injection inside `spawnSession` will populate it from the prior session's next_actions automatically.

### 5. `components/sessions/SessionDetailDrawer.tsx` (MODIFY)

In the existing `NextActionsSection`, add a Continue button:

```tsx
function NextActionsSection({ session }: { session: Session }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ... existing parse logic ...
  const hasOriginator = !!(session.task_id || session.source_file)
  const canContinue = hasNext && hasOriginator

  async function handleContinue() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}/continue`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
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
    <section>
      {/* ... existing list rendering ... */}
      {canContinue && (
        <button onClick={handleContinue} disabled={pending} aria-label="Continue this session">
          {pending ? 'Spawning…' : 'Continue →'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
```

The button uses existing UI tokens (no new styling). Disabled while pending.

## Data flow

```
[Session A ends with summary]
  → extract_next_actions handler populates sessions.next_actions JSON
  → drawer renders NextActionsSection (existing behavior)
  → user clicks "Continue →" button
    → POST /api/sessions/{A}/continue
    → server: spawnSession(taskId, sourceFile from A)
      → prepUserContext (existing)
      → findPriorSessionWithNextActions → returns A
      → injectPriorNextActions → prepends "## Continuing from prior session" block
      → session B persisted with full user_context
    → response { sessionId: B }
    → router push to /sessions?selected=B
```

User can also achieve the carry-forward without clicking Continue: spawning a new session via any existing flow (sidebar, dashboard) for the same task or document picks it up automatically.

## Idempotency and edge cases

- **Respawn**: `respawnSessionWithProvider` reads `sessions.user_context` which already contains both `<!-- prep:auto -->` and `<!-- next-actions:auto -->` markers. Re-running `spawnSession` would no-op both injections.
- **Multiple prior sessions**: most recent ENDED only. If recent session has empty arrays, walk back up to 5.
- **Source session is itself a continuation**: still works. The Continue button on continuation B would spawn C; C picks up B's next_actions (which themselves include A's lineage in the user_context history).
- **Standalone session** (no taskId, no sourceFile): no injection (helper returns null), no Continue button (`hasOriginator === false`).
- **Concurrent session active**: `spawnSession` already throws `CONCURRENT_SESSION:{id}` for source_file collisions — API returns 409 with existing ID.
- **Session A with summary but extract_next_actions failed**: `next_actions` is null → no carry-forward, no Continue button, no error.
- **JSON parse fails**: `parseNextActions` returns null → no injection.

## Testing

- `lib/sessions/__tests__/nextActionsContext.test.ts`
  - Returns null for unparseable JSON / non-array next_actions
  - Renders all three sections (steps, questions, summary excerpt)
  - Idempotent: re-injection on context with marker no-ops
  - Skips injection when both arrays empty
- `lib/sessions/__tests__/findPriorSession.test.ts`
  - Returns null for no taskId AND no sourceFile
  - sourceFile takes precedence over taskId
  - Excludes status='active'
  - Excludes self via excludeSessionId
  - Walks past empty-array sessions up to LIMIT 5
  - Orders by ended_at DESC
- `lib/__tests__/session-manager-next-actions.test.ts`
  - spawnSession with taskId where prior session has next_actions → user_context contains marker + first action text
  - spawnSession with sourceFile where prior session has next_actions → user_context contains marker
  - spawnSession when no prior session → user_context unchanged (no marker)
  - spawnSession when prior session has empty arrays → user_context unchanged
  - Markers in correct order (prep before next-actions before original input)
- `app/api/sessions/__tests__/continue.test.ts`
  - 404 when session does not exist
  - 400 when source has no originator
  - 409 when concurrent session would conflict
  - 200 with new sessionId on success; new session label is "Continuation: {original}"
  - Already-prefixed labels not double-prefixed
- `components/sessions/__tests__/SessionDetailDrawer.test.tsx`
  - Continue button visible when next_actions has items AND originator present
  - Continue button hidden when no originator
  - Click triggers POST and navigates on success
  - Error rendered when API returns error

Target: ~25 new tests, all passing alongside existing 1066.

## Migrations

None. All required columns already exist (`sessions.next_actions`, `sessions.user_context`, `sessions.task_id`, `sessions.source_file`).

## Manual smoke

After merge, verify in dev:
1. Spawn a session for a task or document
2. Let it end (or end manually) so `extract_next_actions` runs
3. Open drawer, see Next-actions section + Continue button
4. Click Continue → new session spawns, drawer opens for it
5. Inspect new session's user_context (via DB or drawer) → contains `<!-- next-actions:auto -->` block with prior actions
6. Spawn a third session for the same originator via sidebar (not via Continue) → should also carry forward most-recent ENDED session's next_actions

## Risks

- **User-context sprawl**: If a long chain of continuations builds up, each session's user_context only includes the most recent prior session's next_actions (not the full chain). This is the right boundary — the LLM gets fresh, focused context per session.
- **Stale carry-forward**: If user edits the task or document significantly between sessions, prior next_actions may no longer be relevant. Acceptable — the LLM is good at recognizing stale guidance, and the user can edit user_context before significant work.
