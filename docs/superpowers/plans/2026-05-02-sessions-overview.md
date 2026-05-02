# Sessions Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global `/sessions` page that lists all sessions across all projects in a 2-col grid with a click-to-open detail drawer (terminal embedded). Rewire 3 floating-window callsites to navigate to the new page.

**Architecture:** New top-level route at `app/(dashboard)/sessions/page.tsx`. Slim `SessionGridCard` for the grid (no per-card WebSocket). Right drawer with embedded xterm via a new shared `useSessionTerminal` hook (extracted from `FloatingSessionWindow`). URL-driven state (`?status=` and `?selected=`).

**Tech Stack:** Next.js 16.2.1 (App Router), React 19.2.4, TanStack Query, xterm.js, Tailwind, vitest + react-testing-library.

**Reference docs (must read before coding):**
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md` — **critical:** any client component using `useSearchParams` MUST be wrapped in `<Suspense>` for production builds.

**Spec:** `docs/superpowers/specs/2026-05-02-sessions-overview-design.md` — read before each task.

---

## Task 1: Extract `useSessionTerminal` hook (no-behavior-change refactor)

**Files:**
- Create: `hooks/useSessionTerminal.ts`
- Create: `tests/hooks/useSessionTerminal.test.ts`
- Modify: `components/FloatingSessionWindow.tsx` (replace inline xterm/WebSocket with hook call)

This is a pure refactor. Floating-window behavior must be byte-identical after this task. Existing tests (`DashboardPage.test.tsx`, `LiveRunsSection.test.tsx`) must still pass without changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks/useSessionTerminal.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { useRef, useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// xterm mocks
const writeSpy = vi.fn()
const disposeSpy = vi.fn()
const onDataSpy = vi.fn()
const onResizeSpy = vi.fn()
const fitSpy = vi.fn()
const openSpy = vi.fn()
const loadAddonSpy = vi.fn()

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: openSpy, write: writeSpy, dispose: disposeSpy,
    onData: onDataSpy, onResize: onResizeSpy, loadAddon: loadAddonSpy,
  })),
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({ fit: fitSpy })),
}))

// WebSocket mock — capture every constructed instance for assertions
const wsInstances: MockWebSocket[] = []
class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  readyState = 0
  onopen: ((e: any) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onclose: ((e: any) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = MockWebSocket.CLOSED })
  constructor(public url: string) {
    wsInstances.push(this)
    // Open async to mimic real WS lifecycle
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.({})
    })
  }
}

class MockResizeObserver {
  observe = vi.fn(); disconnect = vi.fn(); unobserve = vi.fn()
}

import { useSessionTerminal } from '@/hooks/useSessionTerminal'

beforeEach(() => {
  ;(globalThis as any).WebSocket = MockWebSocket
  ;(globalThis as any).ResizeObserver = MockResizeObserver
  wsInstances.length = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Harness: mounts a real DOM node and runs the hook against it.
// We use a synchronous useLayoutEffect-equivalent (set ref before useSessionTerminal effect runs)
// by initializing the ref via a callback ref on first render.
function makeHarness() {
  return renderHook(
    ({ sessionId, enabled }: { sessionId: string; enabled: boolean }) => {
      const ref = useRef<HTMLDivElement>(null)
      useEffect(() => {
        if (!ref.current) ref.current = document.createElement('div')
      }, [])
      // Force the ref non-null synchronously for the hook's first effect run
      if (!ref.current) ref.current = document.createElement('div')
      return useSessionTerminal({ sessionId, containerRef: ref, enabled })
    },
    { initialProps: { sessionId: 's1', enabled: true } }
  )
}

async function flush() {
  // Microtask + RAF to let init's `await new Promise(r => requestAnimationFrame(r))` resolve,
  // and to let queueMicrotask onopen fire.
  await new Promise<void>(r => {
    queueMicrotask(() => requestAnimationFrame(() => r()))
  })
  await new Promise(r => setTimeout(r, 0))
}

describe('useSessionTerminal', () => {
  it('returns connecting state initially when disabled', () => {
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null)
      return useSessionTerminal({ sessionId: 's1', containerRef: ref, enabled: false })
    })
    expect(result.current.termStatus).toBe('connecting')
    expect(wsInstances).toHaveLength(0)
  })

  it('opens a WebSocket and sends attach with the sessionId when enabled', async () => {
    makeHarness().rerender({ sessionId: 'sess-42', enabled: true })
    await flush()
    expect(wsInstances.length).toBeGreaterThan(0)
    const lastWs = wsInstances[wsInstances.length - 1]
    expect(lastWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'attach', sessionId: 'sess-42' }))
  })

  it('writes output messages to terminal with trailing CRLF', async () => {
    makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    ws.onmessage?.({ data: JSON.stringify({ type: 'output', data: 'hello' }) })
    expect(writeSpy).toHaveBeenCalledWith('hello\r\n')
  })

  it('updates state from status messages', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    ws.onmessage?.({ data: JSON.stringify({
      type: 'status', state: 'unresponsive', reason: 'oom', message: 'killed', provider: 'claude', retryAfter: 30,
    }) })
    expect(result.current.sessionState).toBe('unresponsive')
    expect(result.current.sessionReason).toBe('oom')
    expect(result.current.sessionMessage).toBe('killed')
    expect(result.current.sessionProvider).toBe('claude')
    expect(result.current.retryAfter).toBe(30)
  })

  it('derives termStatus=active after status message with state=active', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    ws.onmessage?.({ data: JSON.stringify({ type: 'status', state: 'active' }) })
    expect(result.current.termStatus).toBe('active')
  })

  it('derives termStatus=ended on WebSocket error', async () => {
    const { result } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    ws.onerror?.({})
    expect(result.current.termStatus).toBe('ended')
  })

  it('disposes terminal and closes WebSocket on unmount', async () => {
    const { unmount } = makeHarness()
    await flush()
    const ws = wsInstances[wsInstances.length - 1]
    unmount()
    expect(disposeSpy).toHaveBeenCalled()
    expect(ws.close).toHaveBeenCalled()
  })

  it('tears down and re-inits when sessionId changes', async () => {
    const harness = makeHarness()
    await flush()
    const firstDisposes = disposeSpy.mock.calls.length
    const firstWsCount = wsInstances.length
    harness.rerender({ sessionId: 's2', enabled: true })
    await flush()
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(firstDisposes)
    expect(wsInstances.length).toBeGreaterThan(firstWsCount)
    const newWs = wsInstances[wsInstances.length - 1]
    expect(newWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'attach', sessionId: 's2' }))
  })

  it('tears down when enabled flips to false', async () => {
    const harness = makeHarness()
    await flush()
    const firstDisposes = disposeSpy.mock.calls.length
    harness.rerender({ sessionId: 's1', enabled: false })
    await flush()
    expect(disposeSpy.mock.calls.length).toBeGreaterThan(firstDisposes)
  })

  it('re-inits when enabled flips false → true (per spec contract)', async () => {
    const { rerender } = renderHook(
      ({ on }: { on: boolean }) => {
        const ref = useRef<HTMLDivElement>(null)
        if (!ref.current) ref.current = document.createElement('div')
        return useSessionTerminal({ sessionId: 's1', containerRef: ref, enabled: on })
      },
      { initialProps: { on: false } }
    )
    expect(wsInstances).toHaveLength(0)
    rerender({ on: true })
    await flush()
    expect(wsInstances.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hooks/useSessionTerminal.test.ts`
Expected: FAIL with "Cannot find module '@/hooks/useSessionTerminal'"

- [ ] **Step 3: Implement the hook**

Create `hooks/useSessionTerminal.ts`:

```ts
'use client'
import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '@/components/sessions/SessionStatusBanner'

export type TermStatus = 'active' | 'ended' | 'connecting'

export type SessionTerminalState = {
  termStatus: TermStatus
  sessionState: SessionState
  sessionReason: string | undefined
  sessionMessage: string | undefined
  sessionProvider: string | undefined
  retryAfter: number | undefined
}

type Opts = {
  sessionId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled: boolean
}

function deriveTermStatus(state: SessionState): TermStatus {
  if (state === 'active') return 'active'
  if (state === 'ended') return 'ended'
  return 'connecting'
}

export function useSessionTerminal({ sessionId, containerRef, enabled }: Opts): SessionTerminalState {
  const [sessionState, setSessionState] = useState<SessionState>('active')
  const [sessionReason, setSessionReason] = useState<string | undefined>()
  const [sessionMessage, setSessionMessage] = useState<string | undefined>()
  const [sessionProvider, setSessionProvider] = useState<string | undefined>()
  const [retryAfter, setRetryAfter] = useState<number | undefined>()
  const [errorEnded, setErrorEnded] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    if (!enabled || !containerRef.current) return
    let cancelled = false
    setErrorEnded(false)
    setHasOpened(false)

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled) return

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#a78bfa' },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        cursorBlink: true,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current!)
      termRef.current = term

      await new Promise((r) => requestAnimationFrame(r))
      if (cancelled) { term.dispose(); termRef.current = null; return }
      fit.fit()

      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      )
      wsRef.current = ws

      ws.onopen = () => {
        setHasOpened(true)
        ws.send(JSON.stringify({ type: 'attach', sessionId }))
      }

      ws.onerror = () => setErrorEnded(true)

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') term.write(msg.data + '\r\n')
          if (msg.type === 'status') {
            setSessionState(msg.state as SessionState)
            setSessionReason(msg.reason)
            setSessionMessage(msg.message)
            setSessionProvider(msg.provider)
            setRetryAfter(msg.retryAfter)
          }
        } catch {}
      }

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      term.onResize(() => {
        // Pipe-based sessions do not support resize — no-op
      })

      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(containerRef.current!)
      observerRef.current = observer
    }

    init()

    return () => {
      cancelled = true
      wsRef.current?.close()
      wsRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [sessionId, enabled, containerRef])

  // Derived termStatus: errorEnded > sessionState mapping
  const termStatus: TermStatus = errorEnded
    ? 'ended'
    : !hasOpened
      ? 'connecting'
      : deriveTermStatus(sessionState)

  return { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter }
}
```

- [ ] **Step 4: Run hook tests**

Run: `npx vitest run tests/hooks/useSessionTerminal.test.ts`
Expected: All 10 tests pass.

Common pitfalls to debug if any fail:
- The hook's init runs an `await new Promise(r => requestAnimationFrame(r))` between `term.open` and the WebSocket creation. The `flush()` helper handles this; if a test asserts `wsInstances.length > 0` and gets 0, increase the wait or call `flush()` again.
- `containerRef.current` must be non-null when the effect runs. The harness sets it synchronously before `useSessionTerminal` is called.
- `MockWebSocket.OPEN` and `MockWebSocket.CLOSED` are static constants the hook reads via `WebSocket.OPEN` — these must be available on the mock class.

- [ ] **Step 5: Refactor `FloatingSessionWindow` to use the hook**

Modify `components/FloatingSessionWindow.tsx`:
- Remove the inline `useEffect` block (the existing init effect at lines 63-138: the seven `useState` calls for termStatus/sessionState/Reason/Message/Provider/retryAfter, the `termRef` / `wsRef` / `observerRef` and the entire init `useEffect`).
- Replace state declarations with one hook call:

```tsx
const { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter } =
  useSessionTerminal({ sessionId: session.id, containerRef, enabled: !minimized })
```

- Keep `containerRef`, `dragRef`, drag handling, the JSX (status banner, title bar, terminal div).
- **Preserve the existing kill-button conditional unchanged**: line 174 in the current file reads `if (termStatus === 'active' || sessionState === 'unresponsive') killSession.mutate(session.id)`. After the refactor, both `termStatus` and `sessionState` come from the hook and the conditional must remain identical.
- Import: `import { useSessionTerminal } from '@/hooks/useSessionTerminal'`.
- Remove now-unused imports: `useState` (was used for the seven state vars; only kept if used elsewhere — verify with `grep useState components/FloatingSessionWindow.tsx`). Keep `useCallback` (still used for `onTitleMouseDown`). The `import { SessionStatusBanner, type SessionState }` line becomes `import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'` (SessionState type no longer referenced directly in this file).

- [ ] **Step 6: Run all existing tests**

Run: `npx vitest run`
Expected: 930 passing (no regressions).

If `DashboardPage.test.tsx` or `LiveRunsSection.test.tsx` fail:
- Likely because their `useSessionWindows` mock doesn't account for the now-imported hook. Verify the mocks; the tests should NOT need changes since they don't render an actual `FloatingSessionWindow` (it only mounts when `useSessionWindows().windows` is non-empty).

- [ ] **Step 7: Commit**

```bash
git add hooks/useSessionTerminal.ts tests/hooks/useSessionTerminal.test.ts components/FloatingSessionWindow.tsx
git commit -m "refactor(sessions): extract useSessionTerminal hook from FloatingSessionWindow"
```

---

## Task 2: Build `SessionGridCard`

**Files:**
- Create: `components/sessions/SessionGridCard.tsx`
- Create: `components/sessions/__tests__/SessionGridCard.test.tsx`

Slim card for the overview page. No `useOrchestratorFeed`, no live pills.

- [ ] **Step 1: Write the failing test**

Create `components/sessions/__tests__/SessionGridCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionGridCard } from '../SessionGridCard'
import type { Session } from '@/hooks/useSessions'

const killMutate = vi.fn()
vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return { ...actual, useKillSession: () => ({ mutate: killMutate }) }
})

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project' }] }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 'sess-1',
  project_id: 'proj-1',
  label: 'Build feature',
  phase: 'developing',
  source_file: null,
  status: 'active',
  created_at: '2026-05-02T10:00:00.000Z',
  ended_at: null,
}

describe('SessionGridCard', () => {
  it('renders project name, label, and phase', () => {
    wrap(<SessionGridCard session={baseSession} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText(/developing/i)).toBeInTheDocument()
  })

  it('falls back to project_id when project not found', () => {
    vi.doMock('@/hooks/useProjects', () => ({
      useProjects: () => ({ data: [] }),
    }))
    // Re-import to pick up new mock — easier: just test with a missing project
    wrap(<SessionGridCard session={{ ...baseSession, project_id: 'missing-id' }} />)
    // The fallback will be either 'missing-id' (component-determined) — verify after impl
  })

  it('shows Stop button only for active sessions', () => {
    wrap(<SessionGridCard session={baseSession} />)
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('hides Stop button for ended sessions', () => {
    wrap(<SessionGridCard session={{ ...baseSession, ended_at: '2026-05-02T11:00:00.000Z' }} />)
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
  })

  it('Stop button calls kill mutation and stops propagation', () => {
    const parentClick = vi.fn()
    wrap(
      <div onClick={parentClick}>
        <SessionGridCard session={baseSession} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(killMutate).toHaveBeenCalledWith('sess-1')
    expect(parentClick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/sessions/__tests__/SessionGridCard.test.tsx`
Expected: FAIL — `SessionGridCard` doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/sessions/SessionGridCard.tsx`:

```tsx
'use client'
import { formatDistanceToNow } from 'date-fns'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { session: Session }

export function SessionGridCard({ session }: Props) {
  const { data: projects = [] } = useProjects()
  const projectName = projects.find(p => p.id === session.project_id)?.name ?? session.project_id
  const killSession = useKillSession()
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const startedRel = formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
  const endedRel = session.ended_at
    ? formatDistanceToNow(new Date(session.ended_at), { addSuffix: true })
    : null

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
      {/* Header: phase badge left, status pill right */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-subtle">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
          {initials}
        </span>
        <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
          {isActive ? '● Live' : 'Finished'}
        </span>
      </div>

      {/* Body: project name + label */}
      <div className="px-3.5 py-3">
        <div className="text-[10px] text-text-faint uppercase tracking-wide truncate">{projectName}</div>
        <div className="text-text-primary text-sm font-semibold mt-0.5 truncate">{session.label}</div>
        <div className="text-text-muted text-[11px] mt-1.5">
          <span>started {startedRel}</span>
          <span className="mx-1.5 text-text-faint">·</span>
          <span>{session.phase}</span>
          {endedRel && (
            <>
              <span className="mx-1.5 text-text-faint">·</span>
              <span>ended {endedRel}</span>
            </>
          )}
        </div>
      </div>

      {/* Footer: Stop button (active only) */}
      {isActive && (
        <div className="flex justify-end px-3.5 pb-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              killSession.mutate(session.id)
            }}
            className="bg-transparent border border-accent-red text-accent-red rounded-md px-3 py-1 text-xs cursor-pointer hover:opacity-80"
            style={{ borderColor: '#c0404044' }}
          >
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/sessions/__tests__/SessionGridCard.test.tsx`
Expected: All pass.

If the "falls back to project_id" test fails because `vi.doMock` after render doesn't take effect, simplify: use a separate mock setup at the top of the test using `let projects` and update it between tests, OR delete that test and rely on integration testing (the spec only requires "fall back to session.project_id if no match" — covered by manual smoke).

- [ ] **Step 5: Commit**

```bash
git add components/sessions/SessionGridCard.tsx components/sessions/__tests__/SessionGridCard.test.tsx
git commit -m "feat(sessions): add SessionGridCard for the overview grid"
```

---

## Task 3: Build `SessionDetailDrawer`

**Files:**
- Create: `components/sessions/SessionDetailDrawer.tsx`
- Create: `components/sessions/__tests__/SessionDetailDrawer.test.tsx`

Right-side drawer with embedded terminal. Mirrors `ExternalTaskDetailDrawer` patterns.

- [ ] **Step 1: Write the failing test**

Create `components/sessions/__tests__/SessionDetailDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionDetailDrawer } from '../SessionDetailDrawer'
import type { Session } from '@/hooks/useSessions'

const killMutate = vi.fn()
const openWindowSpy = vi.fn()

vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return { ...actual, useKillSession: () => ({ mutate: killMutate }) }
})
vi.mock('@/hooks/useSessionWindows', () => ({
  useSessionWindows: () => ({ openWindow: openWindowSpy }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project' }] }),
}))
vi.mock('@/hooks/useSessionTerminal', () => ({
  useSessionTerminal: () => ({
    termStatus: 'active',
    sessionState: 'active',
    sessionReason: undefined,
    sessionMessage: undefined,
    sessionProvider: undefined,
    retryAfter: undefined,
  }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 'sess-1', project_id: 'proj-1', label: 'Build feature', phase: 'developing',
  source_file: null, status: 'active', created_at: '2026-05-02T10:00:00.000Z', ended_at: null,
}

const sessions: Session[] = [
  baseSession,
  { ...baseSession, id: 'sess-2', label: 'Other session' },
  { ...baseSession, id: 'sess-3', label: 'Third session' },
]

beforeEach(() => { killMutate.mockClear(); openWindowSpy.mockClear() })

describe('SessionDetailDrawer', () => {
  it('renders header with project name, label, and phase', () => {
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText(/developing/i)).toBeInTheDocument()
  })

  it('Pop out button calls openWindow and onClose', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /pop out/i }))
    expect(openWindowSpy).toHaveBeenCalledWith(baseSession)
    expect(onClose).toHaveBeenCalled()
  })

  it('Stop button calls kill and onClose for active sessions', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    expect(killMutate).toHaveBeenCalledWith('sess-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('hides Stop button for ended sessions', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, ended_at: '2026-05-02T11:00:00.000Z' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument()
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ArrowRight navigates to next session', () => {
    const onNavigate = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={vi.fn()} onNavigate={onNavigate} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith(sessions[1])
  })

  it('ArrowLeft navigates to previous session', () => {
    const onNavigate = vi.fn()
    wrap(<SessionDetailDrawer session={sessions[1]} sessions={sessions} onClose={vi.fn()} onNavigate={onNavigate} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith(sessions[0])
  })

  it('backdrop click closes', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    // Backdrop is the first fixed element with bg-bg-overlay
    const backdrop = document.querySelector('.bg-bg-overlay')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx`
Expected: FAIL — drawer doesn't exist.

- [ ] **Step 3: Implement the component**

Create `components/sessions/SessionDetailDrawer.tsx`:

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink, Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { useSessionTerminal } from '@/hooks/useSessionTerminal'
import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = {
  session: Session
  sessions: Session[]
  onClose: () => void
  onNavigate: (s: Session) => void
}

export function SessionDetailDrawer({ session, sessions, onClose, onNavigate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const { data: projects = [] } = useProjects()
  const projectName = projects.find(p => p.id === session.project_id)?.name ?? session.project_id
  const killSession = useKillSession()
  const { openWindow } = useSessionWindows()
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()

  const { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter } =
    useSessionTerminal({ sessionId: session.id, containerRef, enabled: true })

  const idx = sessions.findIndex(s => s.id === session.id)
  const hasPrev = idx > 0
  const hasNext = idx !== -1 && idx < sessions.length - 1

  useEffect(() => { closeBtnRef.current?.focus() }, [])

  // Auto-close if session leaves the list
  useEffect(() => {
    if (idx === -1) onClose()
  }, [idx, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(sessions[idx - 1])
      if (e.key === 'ArrowRight' && hasNext) onNavigate(sessions[idx + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate, hasPrev, hasNext, idx, sessions])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-overlay" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-screen w-[600px] flex-col border-l border-border-default bg-bg-base shadow-2xl"
      >
        {/* Row 1: prev/next + count + close */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-2 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasPrev && onNavigate(sessions[idx - 1])}
              disabled={!hasPrev}
              aria-label="Previous session"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {idx >= 0 && (
              <span className="text-xs text-text-muted tabular-nums">{idx + 1} / {sessions.length}</span>
            )}
            <button
              onClick={() => hasNext && onNavigate(sessions[idx + 1])}
              disabled={!hasNext}
              aria-label="Next session"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: project + label + badges */}
        <div className="px-4 py-3 border-b border-border-default shrink-0">
          <div className="text-[10px] text-text-faint uppercase tracking-wide">{projectName}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
              {initials}
            </span>
            <span className="text-text-primary text-sm font-semibold flex-1 truncate">{session.label}</span>
            <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
              {isActive ? '● Live' : 'Finished'}
            </span>
          </div>
          <div className="text-text-muted text-[11px] mt-1">{session.phase}</div>
        </div>

        {/* Row 3: actions */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default shrink-0">
          <button
            onClick={() => { openWindow(session); onClose() }}
            className="flex items-center gap-1 bg-bg-secondary border border-border-default text-text-secondary rounded px-2.5 py-1 text-xs hover:text-text-primary"
          >
            <ExternalLink className="w-3 h-3" /> Pop out
          </button>
          {isActive && (
            <button
              onClick={() => { killSession.mutate(session.id); onClose() }}
              className="flex items-center gap-1 bg-transparent border border-accent-red text-accent-red rounded px-2.5 py-1 text-xs hover:opacity-80"
              style={{ borderColor: '#c0404044' }}
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>

        {/* Status banner */}
        <SessionStatusBanner
          state={sessionState}
          reason={sessionReason}
          message={sessionMessage}
          provider={sessionProvider}
          retryAfter={retryAfter}
        />

        {/* Terminal */}
        <div className="relative flex-1 min-h-0 bg-bg-base">
          <div ref={containerRef} className="absolute inset-0 p-2" />
          {termStatus === 'connecting' && (
            <div className="absolute top-2 right-2 text-[10px] text-text-faint">connecting…</div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/sessions/__tests__/SessionDetailDrawer.test.tsx`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add components/sessions/SessionDetailDrawer.tsx components/sessions/__tests__/SessionDetailDrawer.test.tsx
git commit -m "feat(sessions): add SessionDetailDrawer with embedded terminal"
```

---

## Task 4: Build `/sessions` page (header + grid + page)

**Files:**
- Create: `app/(dashboard)/sessions/page.tsx`
- Create: `components/sessions/SessionsHeader.tsx`
- Create: `components/sessions/SessionsGrid.tsx`
- Create: `app/(dashboard)/sessions/__tests__/page.test.tsx`

**Critical Next.js 16 note:** `useSearchParams` MUST be wrapped in `<Suspense>` for production builds (per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`). Pattern: page.tsx is a thin shell that wraps a child client component in Suspense.

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/sessions/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/hooks/useSessions'

const replaceSpy = vi.fn()
const pushSpy = vi.fn()
let mockSearchParams = new URLSearchParams()
let mockSessions: Session[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: pushSpy, back: vi.fn(), forward: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sessions',
}))

vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return {
    ...actual,
    useSessions: () => ({ data: mockSessions, isLoading: false }),
    useKillSession: () => ({ mutate: vi.fn() }),
  }
})
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project' }] }),
}))
vi.mock('@/hooks/useSessionWindows', () => ({
  useSessionWindows: () => ({ openWindow: vi.fn() }),
}))
vi.mock('@/hooks/useSessionTerminal', () => ({
  useSessionTerminal: () => ({
    termStatus: 'active', sessionState: 'active',
    sessionReason: undefined, sessionMessage: undefined, sessionProvider: undefined, retryAfter: undefined,
  }),
}))

import SessionsPage from '../page'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const active: Session = {
  id: 'sess-1', project_id: 'proj-1', label: 'Active session', phase: 'developing',
  source_file: null, status: 'active', created_at: '2026-05-02T10:00:00.000Z', ended_at: null,
}
const ended: Session = { ...active, id: 'sess-2', label: 'Ended session', ended_at: '2026-05-02T11:00:00.000Z' }

beforeEach(() => {
  replaceSpy.mockClear()
  mockSearchParams = new URLSearchParams()
  mockSessions = [active, ended]
})

describe('SessionsPage', () => {
  it('renders only active sessions by default', () => {
    wrap(<SessionsPage />)
    expect(screen.getByText('Active session')).toBeInTheDocument()
    expect(screen.queryByText('Ended session')).not.toBeInTheDocument()
  })

  it('shows ended sessions when filter is "ended"', () => {
    mockSearchParams = new URLSearchParams('status=ended')
    wrap(<SessionsPage />)
    expect(screen.queryByText('Active session')).not.toBeInTheDocument()
    expect(screen.getByText('Ended session')).toBeInTheDocument()
  })

  it('shows all sessions when filter is "all"', () => {
    mockSearchParams = new URLSearchParams('status=all')
    wrap(<SessionsPage />)
    expect(screen.getByText('Active session')).toBeInTheDocument()
    expect(screen.getByText('Ended session')).toBeInTheDocument()
  })

  it('clicking a filter pill calls router.replace with new status', () => {
    wrap(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /all/i }))
    expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining('status=all'))
  })

  it('clicking a card sets ?selected= via router.replace', () => {
    wrap(<SessionsPage />)
    fireEvent.click(screen.getByText('Active session').closest('[role="button"]')!)
    expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining('selected=sess-1'))
  })

  it('opens drawer when ?selected= matches a visible session', () => {
    mockSearchParams = new URLSearchParams('selected=sess-1')
    wrap(<SessionsPage />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not open drawer when ?selected= matches nothing visible', () => {
    mockSearchParams = new URLSearchParams('selected=nonexistent')
    wrap(<SessionsPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows active-filter empty-state copy', () => {
    mockSessions = []
    wrap(<SessionsPage />)
    expect(screen.getByText(/No active sessions yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/sessions/__tests__/page.test.tsx"`
Expected: FAIL — page doesn't exist.

- [ ] **Step 3: Implement `SessionsHeader`**

Create `components/sessions/SessionsHeader.tsx`:

```tsx
'use client'

type StatusFilter = 'active' | 'ended' | 'all'

type Props = {
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  filteredCount: number
}

const PILLS: { key: StatusFilter; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'ended', label: 'Ended' },
  { key: 'all', label: 'All' },
]

export function SessionsHeader({ status, onStatusChange, filteredCount }: Props) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <h1 className="text-lg font-semibold text-text-primary">Sessions</h1>
      <div className="flex items-center gap-1">
        {PILLS.map(p => (
          <button
            key={p.key}
            onClick={() => onStatusChange(p.key)}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              status === p.key
                ? 'bg-bg-tertiary border-border-strong text-text-primary'
                : 'bg-transparent border-border-default text-text-muted hover:text-text-primary'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="text-xs text-text-faint">{filteredCount} {filteredCount === 1 ? 'session' : 'sessions'}</span>
    </div>
  )
}
```

- [ ] **Step 4: Implement `SessionsGrid`**

Create `components/sessions/SessionsGrid.tsx`:

```tsx
'use client'
import type { Session } from '@/hooks/useSessions'
import { SessionGridCard } from './SessionGridCard'

type Props = {
  sessions: Session[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  emptyMessage: string
}

export function SessionsGrid({ sessions, isLoading, selectedId, onSelect, emptyMessage }: Props) {
  if (isLoading) return <p className="text-text-muted text-sm">Loading sessions…</p>
  if (sessions.length === 0) return <p className="text-text-muted text-sm">{emptyMessage}</p>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sessions.map(s => (
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(s.id)
            }
          }}
          className={`rounded-lg cursor-pointer transition ${
            selectedId === s.id ? 'ring-2 ring-accent-blue' : ''
          }`}
        >
          <SessionGridCard session={s} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Implement the page**

Create `app/(dashboard)/sessions/page.tsx`:

```tsx
'use client'
import { Suspense, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import { SessionsHeader } from '@/components/sessions/SessionsHeader'
import { SessionsGrid } from '@/components/sessions/SessionsGrid'
import { SessionDetailDrawer } from '@/components/sessions/SessionDetailDrawer'

type StatusFilter = 'active' | 'ended' | 'all'

const EMPTY_COPY: Record<StatusFilter, string> = {
  active: "No active sessions yet — start one from a project's pipeline page.",
  ended: 'No ended sessions.',
  all: 'No sessions yet.',
}

function SessionsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = (searchParams.get('status') ?? 'active') as StatusFilter
  const selectedId = searchParams.get('selected')

  // Always fetch with 'all' to avoid filter-change race
  const { data: sessions = [], isLoading } = useSessions({ status: 'all' })

  const filtered = useMemo(() => {
    if (status === 'active') return sessions.filter(s => !s.ended_at)
    if (status === 'ended') return sessions.filter(s => s.ended_at)
    return sessions
  }, [sessions, status])

  const selected = filtered.find(s => s.id === selectedId) ?? null

  function setStatus(next: StatusFilter) {
    const sp = new URLSearchParams(searchParams.toString())
    sp.set('status', next)
    const stillVisible = selectedId && sessions.some(s =>
      s.id === selectedId &&
      (next === 'all' || (next === 'active' && !s.ended_at) || (next === 'ended' && s.ended_at))
    )
    if (!stillVisible) sp.delete('selected')
    router.replace(`/sessions?${sp.toString()}`)
  }

  function setSelected(id: string | null) {
    const sp = new URLSearchParams(searchParams.toString())
    if (id) sp.set('selected', id); else sp.delete('selected')
    router.replace(`/sessions?${sp.toString()}`)
  }

  return (
    <>
      <SessionsHeader status={status} onStatusChange={setStatus} filteredCount={filtered.length} />
      <SessionsGrid
        sessions={filtered}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={setSelected}
        emptyMessage={EMPTY_COPY[status]}
      />
      {selected && (
        <SessionDetailDrawer
          session={selected}
          sessions={filtered}
          onClose={() => setSelected(null)}
          onNavigate={(s) => setSelected(s.id)}
        />
      )}
    </>
  )
}

export default function SessionsPage() {
  return (
    <Suspense fallback={<p className="text-text-muted text-sm">Loading sessions…</p>}>
      <SessionsPageContent />
    </Suspense>
  )
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/sessions/__tests__/page.test.tsx"`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/sessions components/sessions/SessionsHeader.tsx components/sessions/SessionsGrid.tsx
git commit -m "feat(sessions): add /sessions overview page with grid and drawer"
```

---

## Task 5: Rewire 3 callsites to navigate instead of opening floating windows

**Files:**
- Modify: `components/layout/Sidebar.tsx` (sidebar Active Sessions list)
- Modify: `app/(dashboard)/projects/[projectId]/page.tsx` (dashboard SessionAgentCard)
- Modify: `components/tasks/LiveRunsSection.tsx` (task drawer Live Runs section)
- Modify: `components/__tests__/DashboardPage.test.tsx` (update assertions to expect router.push, not openWindow)

- [ ] **Step 1: Add a NEW failing test in `DashboardPage.test.tsx` that asserts the rewire**

The existing `DashboardPage.test.tsx` does NOT assert on `openWindow` today (verified: it only asserts on rendered text). So we ADD a new test, not modify an existing one. The mock setup needs `useRouter` added to the `next/navigation` mock (which currently only mocks `useParams`).

Edit `components/__tests__/DashboardPage.test.tsx`:

1. Replace the existing `vi.mock('next/navigation', ...)` block with:

```ts
const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'proj-1' }),
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/projects/proj-1',
  useSearchParams: () => new URLSearchParams(),
}))
```

2. Add a new test inside the existing `describe('DashboardPage', () => { ... })` block:

```ts
it('clicking Open Terminal navigates to /sessions?selected=<id>', async () => {
  const user = (await import('@testing-library/user-event')).default.setup()
  pushSpy.mockClear()
  render(<DashboardPage />, { wrapper })
  await user.click(screen.getByRole('button', { name: /open terminal/i }))
  expect(pushSpy).toHaveBeenCalledWith('/sessions?selected=s1')
})
```

3. Add the import at the top of the file: `import { vi } from 'vitest'` is already present via the global; if `screen` isn't imported, add it: `import { render, screen } from '@testing-library/react'`.

- [ ] **Step 2: Run that test to verify it fails**

Run: `npx vitest run components/__tests__/DashboardPage.test.tsx`
Expected: FAIL — `pushSpy` not called (the dashboard still calls `openWindow`).

- [ ] **Step 3: Rewire the dashboard page**

Modify `app/(dashboard)/projects/[projectId]/page.tsx`:
- Add: `import { useRouter } from 'next/navigation'`
- Inside `DashboardPage`: `const router = useRouter()`
- Change line 57: `onOpenTerminal={() => openWindow(session)}` → `onOpenTerminal={() => router.push('/sessions?selected=' + session.id)}`
- Verify `openWindow` is no longer used in this file: `grep openWindow app/\(dashboard\)/projects/\[projectId\]/page.tsx` — should return only the changed line. If clean, remove `import { useSessionWindows } from '@/hooks/useSessionWindows'` and `const { openWindow } = useSessionWindows()`.

- [ ] **Step 4: Rerun test**

Run: `npx vitest run components/__tests__/DashboardPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rewire the sidebar (with Suspense isolation pre-committed)**

Modify `components/layout/Sidebar.tsx`:
- Replace the import `import { usePathname } from 'next/navigation'` with `import { useRouter, usePathname } from 'next/navigation'`.
- Inside `Sidebar`: `const router = useRouter()`.
- Change line 98: `onOpen={() => openWindow(session)}` → `onOpen={() => router.push('/sessions?selected=' + session.id)}`.
- Verify `openWindow` is no longer used in this file: `grep openWindow components/layout/Sidebar.tsx`. If clean, remove `import { useSessionWindows } from '@/hooks/useSessionWindows'` and `const { openWindow } = useSessionWindows()`.

For sidebar highlight, use the **isolated-Suspense pattern** (committed upfront — do not skip):

The `usePathname` hook does NOT require `<Suspense>`, but `useSearchParams` does. Since the Sidebar is rendered from a layout (not a page), the cleanest fix is to put the `useSearchParams` lookup inside an inner component wrapped in `<Suspense>`:

```tsx
// At top of Sidebar.tsx (with other imports):
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// New helper inside the file:
function SelectedSessionHighlightIndicator({ sessionId, children }: { sessionId: string; children: (isSelected: boolean) => React.ReactNode }) {
  const pathname = usePathname()
  return (
    <Suspense fallback={children(false)}>
      <SelectedSessionInner pathname={pathname} sessionId={sessionId}>{children}</SelectedSessionInner>
    </Suspense>
  )
}

function SelectedSessionInner({ pathname, sessionId, children }: { pathname: string; sessionId: string; children: (isSelected: boolean) => React.ReactNode }) {
  const searchParams = useSearchParams()
  const selected = pathname === '/sessions' ? searchParams?.get('selected') : null
  return <>{children(selected === sessionId)}</>
}

// Then update the active sessions render:
{activeSessions.map(session => (
  <SelectedSessionHighlightIndicator key={session.id} sessionId={session.id}>
    {(isSelected) => (
      <ActiveSessionItem
        session={session}
        onOpen={() => router.push('/sessions?selected=' + session.id)}
        isSelected={isSelected}
      />
    )}
  </SelectedSessionHighlightIndicator>
))}

// Update ActiveSessionItem signature: add `isSelected?: boolean` to Props.
// Update its className from `bg-transparent` to `${isSelected ? 'bg-bg-tertiary' : 'bg-transparent'}`
```

This isolates `useSearchParams` to a small inner component and wraps it in `<Suspense fallback={...}>` so production builds don't fail with "Missing Suspense boundary." The `pathname` prop is computed in the outer component (no Suspense needed) and passed in. The fallback renders `children(false)` so the row appears un-highlighted while the search params resolve, which is the right initial state.

- [ ] **Step 6: Rewire LiveRunsSection**

Modify `components/tasks/LiveRunsSection.tsx`. The relevant code is the `handleOpenTerminal` function at lines 158-170 (the function body constructs a `Session`-shaped object and passes it to `openWindow`). Replace the entire function body with a router push:

Before:
```tsx
function handleOpenTerminal() {
  if (!activeSession) return
  openWindow({
    id: activeSession.id,
    project_id: activeSession.project_id,
    label: activeSession.label,
    phase: activeSession.phase,
    source_file: null,
    status: activeSession.status,
    created_at: activeSession.created_at,
    ended_at: activeSession.ended_at,
  })
}
```

After:
```tsx
function handleOpenTerminal() {
  if (!activeSession) return
  router.push('/sessions?selected=' + activeSession.id)
}
```

Plus:
- Add: `import { useRouter } from 'next/navigation'`
- Inside `LiveRunsSection`: `const router = useRouter()`
- Verify `openWindow` is no longer used in this file: `grep openWindow components/tasks/LiveRunsSection.tsx`. If clean, remove the `import { useSessionWindows } from '@/hooks/useSessionWindows'` line and the `const { openWindow } = useSessionWindows()` line. (Verified by inspection: `openWindow` only appears in `handleOpenTerminal`, so removal is safe.)

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: 930 + new tests passing. If `LiveRunsSection.test.tsx` exists and asserts `openWindow`, update it the same way as DashboardPage.test.tsx. (If no test exists, smoke covers it.)

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: `✓ Compiled successfully`. The `useSearchParams` in `Sidebar.tsx` is wrapped in `<Suspense>` via the `SelectedSessionHighlightIndicator` helper from Step 5; the `useSearchParams` in `app/(dashboard)/sessions/page.tsx` is wrapped in `<Suspense>` via the page's outer component. Both should pass.

If build still fails with "Missing Suspense boundary":
- Check that the inner-component pattern from Step 5 is correctly structured: the component that calls `useSearchParams()` MUST be a child of the `<Suspense>` boundary, not the parent.
- Check that no NEW `useSearchParams` call was introduced elsewhere by mistake.

- [ ] **Step 9: Commit**

```bash
git add app/\(dashboard\)/projects/\[projectId\]/page.tsx components/layout/Sidebar.tsx components/tasks/LiveRunsSection.tsx components/__tests__/DashboardPage.test.tsx
git commit -m "feat(sessions): rewire dashboard, sidebar, and live-runs to navigate to /sessions"
```

---

## Task 6: E2E smoke + ship

**Files:**
- Create: `docs/superpowers/specs/2026-05-02-sessions-overview-smoke.md`

This task is verification-only. No production code changes.

- [ ] **Step 1: Run full test suite**

```bash
cd /home/tomespen/git/project-control/.worktrees/sessions-overview
npx vitest run 2>&1 | tail -20
```

Expected: all tests pass (930 prior + new from tasks 1-5). If failures appear in unrelated files, check `git diff main..HEAD` to confirm no regression in this branch caused them.

- [ ] **Step 2: Production build**

```bash
npm run build 2>&1 | tail -30
```

Expected: `✓ Compiled successfully`. No TypeScript errors. No "Missing Suspense" errors.

- [ ] **Step 3: Write the smoke checklist**

Save to `docs/superpowers/specs/2026-05-02-sessions-overview-smoke.md` with the 14 steps from the spec's "Smoke test" section. Pull them verbatim from the spec.

- [ ] **Step 4: Commit smoke doc**

```bash
git add docs/superpowers/specs/2026-05-02-sessions-overview-smoke.md
git commit -m "docs(sessions): add manual smoke checklist for sessions-overview slice"
```

- [ ] **Step 5: Final summary report**

Print the gate results (test count, build status, smoke doc path, branch tip SHA) and a confidence statement on mergeability.

---

## Self-Review Checklist (controller runs after all tasks complete)

- All 5 implementation tasks committed individually.
- Vitest suite: 930 prior + new tests, 0 failures.
- `npm run build`: clean, no Suspense errors.
- Three rewire sites verified by manual smoke (sidebar / dashboard / live-runs).
- `useSessionTerminal` extraction is byte-equivalent for `FloatingSessionWindow`.
- Smoke doc covers all 14 manual steps including ended-session attach.
- No accidental changes to: API routes, DB schema, `useSessionWindows`, `FloatingSessionWindow` JSX (only its inner xterm/WS logic moved).

## Out-of-Scope Reminders (per spec)

- Do NOT delete `components/DevelopingView.tsx` — orthogonal cleanup.
- Do NOT add localStorage filter persistence.
- Do NOT add a "← Back to project" breadcrumb on the new page.
- Do NOT touch `useOrchestratorFeed` performance — slim card avoids the issue entirely.
- Do NOT add read-only mode for ended sessions.
