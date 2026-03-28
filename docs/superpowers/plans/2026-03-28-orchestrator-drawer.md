# Orchestrator Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global sidebar drawer that shows all active sessions across Ideas, Specs, Plans, and Developing as a course-module-style list, plus a combined live feed of raw PTY output from all active sessions.

**Architecture:** A new `OrchestratorDrawer` component is added to the dashboard layout alongside the existing `NavDrawer`. It reads all active sessions via `useSessions({ status: 'active' })`, renders them as phase-colored module rows, and opens one WebSocket per active session to collect and interleave raw output into a shared feed buffer. The nav trigger is a new button in `TopNav` — separate from the existing Brain/Menu buttons. The drawer slides in from the right at `z-50` with no backdrop, no content push.

**Tech Stack:** Next.js 16 App Router, React, TailwindCSS, lucide-react, existing `/ws` WebSocket server, existing `useSessions` hook, `@tanstack/react-query`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `components/OrchestratorDrawer.tsx` | Full drawer UI: module list + combined feed |
| Create | `hooks/useOrchestratorFeed.ts` | Opens WebSockets for all active sessions, aggregates feed entries |
| Modify | `components/nav/TopNav.tsx` | Add orchestrator toggle button with active-session badge |
| Modify | `app/(dashboard)/layout.tsx` | Wire `showOrchestrator` state + render `OrchestratorDrawer` |

---

## Task 1: `useOrchestratorFeed` hook

**Files:**
- Create: `hooks/useOrchestratorFeed.ts`
- Test: `hooks/__tests__/useOrchestratorFeed.test.ts`

This hook accepts a list of active sessions and returns a feed buffer of timestamped output lines. It opens one WebSocket per session, attaches to it, and collects raw output messages. It closes stale WebSockets when sessions are removed.

- [ ] **Step 1: Write the failing test**

```typescript
// hooks/__tests__/useOrchestratorFeed.test.ts
import { renderHook, act } from '@testing-library/react'
import { useOrchestratorFeed } from '../useOrchestratorFeed'
import type { Session } from '../useSessions'

const makeSession = (id: string, phase: string): Session => ({
  id,
  project_id: 'p1',
  label: `Task ${id}`,
  phase,
  source_file: null,
  status: 'active',
  created_at: new Date().toISOString(),
  ended_at: null,
})

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  readyState = 1
  constructor(public url: string) { MockWebSocket.instances.push(this) }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3; this.onclose?.() }
  emit(data: string) { this.onmessage?.({ data }) }
}

beforeEach(() => { MockWebSocket.instances = [] })
;(global as any).WebSocket = MockWebSocket

test('opens one WebSocket per session', () => {
  const sessions = [makeSession('s1', 'idea'), makeSession('s2', 'plan')]
  renderHook(() => useOrchestratorFeed(sessions))
  expect(MockWebSocket.instances).toHaveLength(2)
})

test('attaches to session on open', () => {
  const sessions = [makeSession('s1', 'idea')]
  renderHook(() => useOrchestratorFeed(sessions))
  act(() => { MockWebSocket.instances[0].onopen?.() })
  expect(JSON.parse(MockWebSocket.instances[0].sent[0])).toEqual({ type: 'attach', sessionId: 's1' })
})

test('appends output to feed', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { result } = renderHook(() => useOrchestratorFeed(sessions))
  act(() => {
    MockWebSocket.instances[0].onopen?.()
    MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: 'hello\n' }))
  })
  expect(result.current.feed).toHaveLength(1)
  expect(result.current.feed[0].text).toBe('hello\n')
  expect(result.current.feed[0].sessionId).toBe('s1')
  expect(result.current.feed[0].label).toBe('Task s1')
  expect(result.current.feed[0].phase).toBe('idea')
  expect(result.current.feed[0].timestamp).toBeDefined()
})

test('closes WebSocket when session removed', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { rerender } = renderHook(({ s }) => useOrchestratorFeed(s), { initialProps: { s: sessions } })
  act(() => { MockWebSocket.instances[0].onopen?.() })
  rerender({ s: [] })
  expect(MockWebSocket.instances[0].readyState).toBe(3)
})

test('ignores non-output WebSocket messages', () => {
  const sessions = [makeSession('s1', 'idea')]
  const { result } = renderHook(() => useOrchestratorFeed(sessions))
  act(() => {
    MockWebSocket.instances[0].onopen?.()
    MockWebSocket.instances[0].emit(JSON.stringify({ type: 'status', data: 'ended' }))
  })
  expect(result.current.feed).toHaveLength(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/tomespen/git/project-control
npx jest hooks/__tests__/useOrchestratorFeed.test.ts --no-coverage
```

Expected: FAIL — `useOrchestratorFeed` not found.

- [ ] **Step 3: Implement the hook**

```typescript
// hooks/useOrchestratorFeed.ts
'use client'
import { useEffect, useRef, useState } from 'react'
import type { Session } from './useSessions'

export type FeedEntry = {
  id: string
  sessionId: string
  label: string
  phase: string
  text: string
  timestamp: string
}

export function useOrchestratorFeed(sessions: Session[]) {
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const wsMap = useRef<Map<string, WebSocket>>(new Map())
  const entryCounter = useRef(0)

  useEffect(() => {
    const activeIds = new Set(sessions.map((s) => s.id))

    // Close WebSockets for sessions that are no longer active
    for (const [id, ws] of wsMap.current.entries()) {
      if (!activeIds.has(id)) {
        ws.close()
        wsMap.current.delete(id)
      }
    }

    // Open WebSockets for new sessions
    for (const session of sessions) {
      if (wsMap.current.has(session.id)) continue

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type !== 'output') return
          const entry: FeedEntry = {
            id: `${session.id}-${++entryCounter.current}`,
            sessionId: session.id,
            label: session.label,
            phase: session.phase,
            text: msg.data,
            timestamp: new Date().toISOString(),
          }
          setFeed((prev) => [...prev.slice(-500), entry])
        } catch {}
      }

      wsMap.current.set(session.id, ws)
    }
  }, [sessions])

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const ws of wsMap.current.values()) ws.close()
      wsMap.current.clear()
    }
  }, [])

  return { feed }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest hooks/__tests__/useOrchestratorFeed.test.ts --no-coverage
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/useOrchestratorFeed.ts hooks/__tests__/useOrchestratorFeed.test.ts
git commit -m "feat: useOrchestratorFeed hook — WebSocket feed aggregator for all active sessions"
```

---

## Task 2: `OrchestratorDrawer` component

**Files:**
- Create: `components/OrchestratorDrawer.tsx`

This component renders the full drawer. It uses `useSessions({ status: 'active' })` to get active sessions, renders them as phase-colored module rows, then below a divider renders the combined live feed from `useOrchestratorFeed`.

**Phase color map** (used for badge, left border, feed dot):
- `idea` / `ideate` → purple: `bg-purple-600`, `border-purple-500`, `text-purple-400`
- `spec` → blue: `bg-blue-600`, `border-blue-500`, `text-blue-400`
- `plan` → amber: `bg-amber-500`, `border-amber-400`, `text-amber-400`
- `develop` / `developing` → green: `bg-green-600`, `border-green-500`, `text-green-400`
- fallback → violet: `bg-violet-600`, `border-violet-500`, `text-violet-400`

**Status icon rules:**
- Session `status === 'active'` → animated pulse dot (phase color)
- Session `status === 'ended'` → `CheckCircle` icon from lucide-react, `text-zinc-500`
- No session (pending) → `Lock` icon from lucide-react, `text-zinc-700`

**Row ordering:** active sessions first, ended second.

- [ ] **Step 1: Write the component**

```tsx
// components/OrchestratorDrawer.tsx
'use client'
import { useEffect, useRef } from 'react'
import { X, CheckCircle, Lock } from 'lucide-react'
import { useSessions } from '@/hooks/useSessions'
import { useOrchestratorFeed } from '@/hooks/useOrchestratorFeed'
import { formatDistanceToNow } from 'date-fns'

type Props = {
  isOpen: boolean
  onClose: () => void
}

type PhaseColors = {
  badge: string
  border: string
  dot: string
  text: string
}

function phaseColors(phase: string): PhaseColors {
  const p = phase.toLowerCase()
  if (p === 'idea' || p === 'ideate') return { badge: 'bg-purple-600', border: 'border-l-purple-500', dot: 'bg-purple-400', text: 'text-purple-400' }
  if (p === 'spec') return { badge: 'bg-blue-600', border: 'border-l-blue-500', dot: 'bg-blue-400', text: 'text-blue-400' }
  if (p === 'plan') return { badge: 'bg-amber-500', border: 'border-l-amber-400', dot: 'bg-amber-400', text: 'text-amber-400' }
  if (p === 'develop' || p === 'developing') return { badge: 'bg-green-600', border: 'border-l-green-500', dot: 'bg-green-400', text: 'text-green-400' }
  return { badge: 'bg-violet-600', border: 'border-l-violet-500', dot: 'bg-violet-400', text: 'text-violet-400' }
}

function relativeTime(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function OrchestratorDrawer({ isOpen, onClose }: Props) {
  // Fetch all sessions (active + ended) so ended rows appear dimmed with checkmarks
  const { data: sessions = [] } = useSessions({ status: 'all' })
  const activeSessions = sessions.filter((s) => s.status === 'active')
  const { feed } = useOrchestratorFeed(isOpen ? activeSessions : [])
  const feedRef = useRef<HTMLDivElement>(null)

  // Auto-scroll feed to bottom on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [feed])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Order: active first, ended second. Lock-icon state (no session) is out of scope
  // for this implementation — the sessions API only returns items that have been started.
  const active = sessions.filter((s) => s.status === 'active')
  const ended = sessions.filter((s) => s.status !== 'active')
  const ordered = [...active, ...ended]

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Orchestrator</span>
          {active.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {active.length} active
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      {/* Module list */}
      <div className="shrink-0 overflow-y-auto max-h-[45%]">
        {ordered.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-6">No active sessions</p>
        )}
        {ordered.map((session, i) => {
          const colors = phaseColors(session.phase)
          const isActive = session.status === 'active'
          return (
            <div
              key={session.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 border-l-2 transition-colors ${
                isActive
                  ? `${colors.border} bg-zinc-900`
                  : 'border-l-transparent'
              } ${!isActive ? 'opacity-50' : ''}`}
            >
              {/* Phase badge */}
              <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${colors.badge} ${!isActive ? 'opacity-60' : ''}`}>
                {i + 1}
              </div>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-zinc-100 truncate">{session.label}</p>
              </div>

              {/* Status icon */}
              <div className="shrink-0">
                {isActive ? (
                  <span className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse block`} />
                ) : (
                  <CheckCircle size={14} className="text-zinc-500" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800 shrink-0" />

      {/* Combined feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {feed.length === 0 && (
          <p className="text-[10px] text-zinc-700 text-center py-4">Waiting for output...</p>
        )}
        {feed.map((entry) => {
          const colors = phaseColors(entry.phase)
          return (
            <div key={entry.id} className="flex items-start gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 shrink-0`} />
              <span className={`text-[10px] font-medium shrink-0 ${colors.text} max-w-[60px] truncate`}>
                {entry.label}
              </span>
              <span className="text-[10px] text-zinc-600 shrink-0">
                {relativeTime(entry.timestamp)}
              </span>
              <span className="font-mono text-[10px] text-zinc-400 truncate flex-1">
                {entry.text.replace(/\n$/, '')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Check for TypeScript errors**

```bash
cd /home/tomespen/git/project-control
npx tsc --noEmit 2>&1 | grep OrchestratorDrawer
```

Expected: no errors for `OrchestratorDrawer.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/OrchestratorDrawer.tsx
git commit -m "feat: OrchestratorDrawer — module list + combined live feed"
```

---

## Task 3: Wire trigger into `TopNav`

**Files:**
- Modify: `components/nav/TopNav.tsx`

Add `onOrchestratorToggle` and `isOrchestratorOpen` props. Add a new `Activity` icon button in the right-side controls, between the Brain button and the Menu button. The badge shows the count of active sessions from `useSessions({ status: 'active' })`. The badge pulses when any session is active.

- [ ] **Step 1: Read the current TopNav props type**

The existing props type is at `components/nav/TopNav.tsx:27`:
```typescript
type TopNavProps = {
  onAssistantToggle?: () => void
  isAssistantOpen?: boolean
  onDrawerToggle?: () => void
  isDrawerOpen?: boolean
}
```

- [ ] **Step 2: Modify `TopNav.tsx`**

Add `Activity` to the lucide-react import. Add two new props. Add `useSessions` import. Add the button between Brain and Settings.

Replace the import line:
```typescript
import { Settings, Brain, Focus, Bell, Menu } from 'lucide-react'
```
With:
```typescript
import { Settings, Brain, Focus, Bell, Menu, Activity } from 'lucide-react'
```

Add `useSessions` import after the existing hooks imports:
```typescript
import { useSessions } from '@/hooks/useSessions'
```

Replace the `TopNavProps` type:
```typescript
type TopNavProps = {
  onAssistantToggle?: () => void
  isAssistantOpen?: boolean
  onDrawerToggle?: () => void
  isDrawerOpen?: boolean
  onOrchestratorToggle?: () => void
  isOrchestratorOpen?: boolean
}
```

Replace the function signature:
```typescript
export function TopNav({ onAssistantToggle, isAssistantOpen, onDrawerToggle, isDrawerOpen, onOrchestratorToggle, isOrchestratorOpen }: TopNavProps = {}) {
```

Add after the `const { windows, toggleAll } = useSessionWindows()` line:
```typescript
const { data: activeSessions = [] } = useSessions({ status: 'active' })
  const activeCount = activeSessions.length
```

Add the orchestrator button in the right controls section, between the Brain block and the Settings link:
```tsx
{/* Orchestrator */}
{onOrchestratorToggle && (
  <div className="relative">
    <button
      onClick={onOrchestratorToggle}
      className={`p-1.5 rounded transition-colors ${isOrchestratorOpen ? 'text-green-400 bg-green-500/10' : activeCount > 0 ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      title="Orchestrator"
    >
      <Activity size={16} />
    </button>
    {activeCount > 0 && (
      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-green-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
        {activeCount > 9 ? '9+' : activeCount}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 3: Check for TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep TopNav
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/nav/TopNav.tsx
git commit -m "feat: add orchestrator toggle button to TopNav with active-session badge"
```

---

## Task 4: Wire drawer into layout

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

Add `showOrchestrator` state, pass `onOrchestratorToggle`/`isOrchestratorOpen` to `TopNav`, render `OrchestratorDrawer` inside the layout.

- [ ] **Step 1: Modify `layout.tsx`**

Add import at the top of the existing imports:
```typescript
import { OrchestratorDrawer } from '@/components/OrchestratorDrawer'
```

Add state after the existing `showDrawer` state:
```typescript
const [showOrchestrator, setShowOrchestrator] = useState(false)
```

Replace the `<TopNav ...>` line with:
```tsx
<TopNav
  onAssistantToggle={assistant.toggle}
  isAssistantOpen={assistant.isOpen}
  onDrawerToggle={() => setShowDrawer(p => !p)}
  isDrawerOpen={showDrawer}
  onOrchestratorToggle={() => setShowOrchestrator(p => !p)}
  isOrchestratorOpen={showOrchestrator}
/>
```

Add `OrchestratorDrawer` just before the closing `</div>` of the `min-h-screen` wrapper (after `<NavDrawer ...>`):
```tsx
<OrchestratorDrawer isOpen={showOrchestrator} onClose={() => setShowOrchestrator(false)} />
```

- [ ] **Step 2: Check for TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep -E "layout|OrchestratorDrawer"
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Expected: all existing tests pass, new hook tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/layout.tsx
git commit -m "feat: wire OrchestratorDrawer into dashboard layout"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify trigger button**

Open the app. Confirm the `Activity` icon appears in the top-right nav bar. With no active sessions: icon is zinc-gray, no badge. Launch any session from Ideas/Specs/Plans/Developing. Badge should appear (green, pulsing) with count.

- [ ] **Step 3: Verify drawer opens**

Click the Activity icon. Drawer slides in from the right. Header shows "Orchestrator" + active count. Module list shows active sessions as colored rows with animated pulse dots. Ended sessions appear dimmer with checkmark icons. No active sessions shows "No active sessions" message.

- [ ] **Step 4: Verify module row styling**

Each row has:
- Numbered square badge (phase-colored: purple=idea, blue=spec, amber=plan, green=develop)
- Bold session label, truncated
- Animated pulse dot on the right for active; checkmark for ended
- Active rows have a colored left border and slightly lighter background

- [ ] **Step 5: Verify combined feed**

With one or more active sessions, the feed section below the divider shows interleaved output lines. Each line has: colored phase dot, session label, relative timestamp, monospace output text. Feed auto-scrolls to bottom as new output arrives.

- [ ] **Step 6: Verify close behavior**

Clicking X closes drawer. Pressing Escape closes drawer. Re-opening resumes feed (WebSockets reconnect).

- [ ] **Step 7: Final commit if any fixes applied**

```bash
git add -p
git commit -m "fix: orchestrator drawer manual verification fixes"
```
