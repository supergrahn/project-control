# Sessions Overview — Design Spec

**Date:** 2026-05-02
**Branch:** `feature/sessions-overview`
**Status:** Draft

## Goal

Add a top-level `/sessions` page that lists every session (across all projects) in a 2-column grid. Clicking a card opens a right-side drawer with a live terminal, reusing the existing WebSocket-attached xterm interaction (the same one floating windows use today). Three existing "open in floating window" callsites are rewired to instead navigate to the new page with the session pre-selected. Floating windows are kept as a "Pop out ↗" affordance from inside the drawer.

## Non-Goals

- No new persistence — sessions, WebSocket, kill, and SSE/polling APIs are unchanged.
- No removal of `FloatingSessionWindow` — it stays as the pop-out surface.
- No mobile layout work — this is a desktop-first internal app. (2-col grid collapses to 1-col below `lg` breakpoint, but no other adaptation.)
- No filter persistence in localStorage. The filter is URL-driven and ephemeral (resets on each visit).

## Architecture

### Route

New top-level route: `app/(dashboard)/sessions/page.tsx`. The `(dashboard)` layout's `SidebarWrapper` and `TopBarWrapper` already short-circuit (return `null`) when there is no `projectId` URL param (`app/(dashboard)/layout.tsx:132,148`). So the `/sessions` page renders inside the `<main>` slot with no project sidebar — the same shape as `/memory`, `/timeline`, `/settings`, etc. This is intentional: the page is global, not project-scoped.

### URL state

- `/sessions` — page with no selection, drawer closed.
- `/sessions?selected=<sessionId>` — drawer open, that session selected.
- `/sessions?status=active|ended|all` — filter (default `active`). Persists in URL on filter pill click; resets between visits.
- Both query params combine: `/sessions?status=all&selected=abc`.

URL is the single source of truth for both selection and filter. The page reads `useSearchParams()` and writes via `router.replace(...)` to avoid pushing history entries on filter / selection changes (so the back button leaves `/sessions` entirely rather than walking through prior selections).

**Next.js 16 idiom note:** Plan author MUST consult `node_modules/next/dist/docs/` for the current `useSearchParams` / `useRouter` / `<Link>` conventions before writing the page boilerplate. The CLAUDE.md banner ("This is NOT the Next.js you know") explicitly warns that these APIs may differ from training data.

### Back navigation

Top-level pages in this app (`/memory`, `/settings`, `/timeline`) have no project sidebar; users navigate between projects via the leftmost `ProjectRail` strip (always visible). `/sessions` follows the same convention: no breadcrumb in the page header, no "← Back to {project}" link. The `ProjectRail` icons remain clickable; clicking one routes to that project's dashboard. This is consistent with every other top-level page and avoids special-casing.

### Components

```
app/(dashboard)/sessions/page.tsx       — top-level route; reads URL state; fetches sessions; renders grid + drawer
components/sessions/SessionsGrid.tsx    — 2-col grid of SessionGridCard
components/sessions/SessionGridCard.tsx — slim card for the overview (label, project, phase, status, started_at, Stop)
components/sessions/SessionDetailDrawer.tsx — right drawer with terminal; uses useSessionTerminal hook
hooks/useSessionTerminal.ts             — extracted xterm + WebSocket logic, used by both drawer AND FloatingSessionWindow
```

**Why a new `SessionGridCard` instead of reusing `SessionAgentCard`:** The existing `SessionAgentCard` derives its tool pills and TodoWrite progress bar from `useOrchestratorFeed(sessions)`, which opens **one WebSocket per session** (`hooks/useOrchestratorFeed.ts:31-67`). On a global page that lists every active session across every project, that's 10–50+ persistent WebSockets — wasteful and prone to hitting per-host caps. The grid card is the slim variant: no live pills, no todos, no per-card WebSocket. Live interaction lives in the drawer (one WebSocket at a time, attached only when the drawer is open).

### Hook: `useSessionTerminal`

**Why:** The xterm + WebSocket setup currently lives only in `FloatingSessionWindow.tsx:63-138`. We need the same logic in two surfaces (drawer + floating window). Extracting it into a hook is the only sane way to avoid behavior drift and to keep the drawer's terminal in sync with the existing one.

**Signature:**

```ts
export type SessionTerminalState = {
  termStatus: 'active' | 'ended' | 'connecting'
  sessionState: SessionState  // re-export from SessionStatusBanner
  sessionReason: string | undefined
  sessionMessage: string | undefined
  sessionProvider: string | undefined
  retryAfter: number | undefined
}

export function useSessionTerminal(opts: {
  sessionId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled: boolean  // false → skip init (e.g. drawer closed, window minimized)
}): SessionTerminalState
```

**Contract:**
- Initial state on first render: `termStatus = 'connecting'`, `sessionState = 'active'`, all reason/message/provider/retryAfter undefined.
- When `enabled` flips `false → true` (or starts true), the hook initializes xterm, opens WebSocket to `/ws`, sends `{ type: 'attach', sessionId }`, wires input/output, and starts a `ResizeObserver` on `containerRef.current`.
- When `enabled` flips `true → false` OR `sessionId` changes OR the component unmounts, it disposes xterm, closes the WebSocket, and disconnects the observer (full teardown). On `sessionId` change, a fresh init runs after teardown.
- On `{ type: 'status' }`, the hook sets `sessionState`, `sessionReason`, `sessionMessage`, `sessionProvider`, `retryAfter` from the message. `termStatus` is **derived from `sessionState`** by the same mapping the current code uses (active → 'active', ended → 'ended', other → 'connecting'). It is not stored as a separate state variable. (The current `FloatingSessionWindow.tsx:103-104` stores both — we collapse to one.)
- WebSocket `onerror` sets `termStatus` to `'ended'` directly (independent of `sessionState`, which the message stream may never have delivered). No reconnect attempt — same as today.
- Pipe-based sessions don't support resize → `term.onResize` is a no-op (same as today).

The hook does not own any UI. The container element + status banner + buttons remain the consumer's responsibility.

### Sessions Grid Page

**File:** `app/(dashboard)/sessions/page.tsx`

```tsx
'use client'
export default function SessionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const status = (searchParams.get('status') ?? 'active') as 'active' | 'ended' | 'all'
  const selectedId = searchParams.get('selected')

  // Always fetch with 'all'. Filter client-side. This avoids a race where
  // changing the filter triggers both a refetch AND a setSelected guard that
  // can't see the new rows yet.
  const { data: sessions = [], isLoading } = useSessions({ status: 'all' })

  const filtered = useMemo(() => {
    if (status === 'active') return sessions.filter(s => !s.ended_at)
    if (status === 'ended') return sessions.filter(s => s.ended_at)
    return sessions
  }, [sessions, status])

  const selected = filtered.find(s => s.id === selectedId) ?? null

  function setStatus(next: 'active' | 'ended' | 'all') {
    const sp = new URLSearchParams(searchParams)
    sp.set('status', next)
    // If the currently selected session is excluded by the new filter, drop selection.
    const stillVisible = selectedId && sessions.some(s =>
      s.id === selectedId &&
      (next === 'all' || (next === 'active' && !s.ended_at) || (next === 'ended' && s.ended_at))
    )
    if (!stillVisible) sp.delete('selected')
    router.replace(`/sessions?${sp}`)
  }

  function setSelected(id: string | null) {
    const sp = new URLSearchParams(searchParams)
    if (id) sp.set('selected', id); else sp.delete('selected')
    router.replace(`/sessions?${sp}`)
  }

  return (
    <>
      <SessionsHeader status={status} onStatusChange={setStatus} filteredCount={filtered.length} />
      <SessionsGrid sessions={filtered} isLoading={isLoading} selectedId={selectedId} onSelect={setSelected} />
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
```

**Data fetching:** Always passes `status: 'all'` to `useSessions`. The hook's `refetchInterval` only fires when called with `status: 'active'`, so this means the page does not auto-refresh — we accept that. (Rationale: avoiding the filter-change race outweighs polling parity with the dashboard.) Users see new sessions on next nav/refresh. If polling proves missed, a follow-up can extend `useSessions` with a `pollInterval` arg.

**Empty state:** Under the filter pills when `filtered.length === 0`:
- `'active'` filter: "No active sessions yet — start one from a project's pipeline page."
- `'ended'` filter: "No ended sessions."
- `'all'` filter: "No sessions yet."

**Loading state:** "Loading sessions…" under the filter pills (only on initial load; React Query treats subsequent fetches as background).

### Sessions Header

Filter pills (Active / Ended / All), count badge showing `filteredCount` (the number of sessions visible under the current filter — *not* a separate count of active sessions). A single `<h1>` "Sessions". No "New session" button on this page — sessions are launched from project pipelines (per existing convention in `app/(dashboard)/projects/[projectId]/page.tsx:45`).

### Sessions Grid

**File:** `components/sessions/SessionsGrid.tsx`

```tsx
type Props = {
  sessions: Session[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}
```

Layout: `grid grid-cols-1 lg:grid-cols-2 gap-4`. Each cell wraps a `SessionGridCard` in a clickable `<div>`:

```tsx
<div
  key={session.id}
  role="button"
  tabIndex={0}
  onClick={() => onSelect(session.id)}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(session.id) } }}
  className={cn(
    'rounded-lg cursor-pointer transition',
    selectedId === session.id && 'ring-2 ring-accent-blue'
  )}
>
  <SessionGridCard session={session} />
</div>
```

The card itself owns one interactive element (a Stop button for active sessions). That button must call `e.stopPropagation()` in its onClick to prevent the wrapper from firing. No other interactive elements exist inside the card.

### Session Grid Card

**File:** `components/sessions/SessionGridCard.tsx`

```tsx
type Props = { session: Session }
```

Visual structure (top → bottom):
- Header row: phase badge (left), live/finished status pill (right).
- Project name (small, muted) + session label (semibold, single-line truncate).
- Meta row: `started <relativeTime>` · `<phase>` · if ended, `ended <relativeTime>`.
- Footer row: Stop button (red, only when active session). `e.stopPropagation()` on click; calls `useKillSession().mutate(session.id)`.

Looks up `project.name` via `useProjects()` — same pattern the drawer uses. Falls back to `session.project_id` if no match. NO `useOrchestratorFeed` — no live pills, no todos, no per-card WebSocket. Static once mounted.

### Session Detail Drawer

**File:** `components/sessions/SessionDetailDrawer.tsx`

Mirrors `components/tasks/ExternalTaskDetailDrawer.tsx` structure:

- Backdrop overlay (`fixed inset-0 z-40 bg-bg-overlay`, click → `onClose`).
- Drawer panel: `fixed right-0 top-0 z-50 flex h-screen w-[600px] flex-col border-l border-border-default bg-bg-base shadow-2xl`. Width is 600px (vs. 480px for task drawer) because the body embeds an xterm.
- Keyboard: **Escape closes**; **ArrowLeft/ArrowRight** navigate to the previous/next session in the filtered list (array-linear, NOT geometric — same convention as `ExternalTaskDetailDrawer.tsx:42-46`).
- Header (top → bottom):
  - Row 1: prev (←) / next (→) chevrons + "N / total" + close (X).
  - Row 2: project name (small, muted) + session label (bold, truncated) + phase badge + status pill.
  - Row 3: action buttons — `Pop out ↗` and `Stop ⏹` (Stop only when session is active). Pop out closes the drawer and calls `openWindow(session)`. Stop calls `useKillSession().mutate(session.id)` and closes the drawer.
- Body: `<SessionStatusBanner ... />` then `<div ref={containerRef} className="flex-1 p-2 min-h-0" />` with `useSessionTerminal({ sessionId, containerRef, enabled: true })`.
- Footer: none — input goes through xterm itself (`term.onData`), same as `FloatingSessionWindow`. No separate input box.

**Project name:** The drawer needs to display the project's `name`, but `Session` only has `project_id`. We resolve the name client-side via `useProjects()` — find the project and show `project.name`, falling back to the project_id if missing.

**Empty terminal scrollback for ended sessions:** When `session.ended_at` is set, the terminal still attaches and shows whatever the WebSocket replays (the server is responsible for replay; we don't change that). `term.onData` keystrokes still fire, but the WebSocket may close them out — we accept whatever the existing FloatingSessionWindow does today (no special read-only mode).

**Width on small screens:** The drawer is `w-[600px]` fixed; on screens narrower than 600px it would overflow. This is desktop-only software — we accept that.

### Behavior changes (rewires)

Three click handlers change from "open floating window" to "navigate to /sessions?selected=X":

1. `components/layout/Sidebar.tsx:98` — `<ActiveSessionItem onOpen={() => router.push('/sessions?selected=' + session.id)} />`. Highlight the row with a subtle `bg-bg-tertiary` if the current pathname is `/sessions` and the URL `?selected=` matches `session.id`.

2. `app/(dashboard)/projects/[projectId]/page.tsx:57` — `onOpenTerminal={() => router.push('/sessions?selected=' + session.id)}`.

3. `components/tasks/LiveRunsSection.tsx` (the "Open Terminal" button inside the task-detail Live Runs section) — same rewire. (Verified callsite; this was missed in the initial spec draft.)

**Not in the rewire list:**
- `components/DevelopingView.tsx` — file exists but is **not imported anywhere** (the actual `/developing` route renders task cards, not session cards). Leave the file untouched; the dead-code cleanup is out of scope.

`useSessionWindows().openWindow` itself is untouched. The `SessionWindowProvider` is still in the layout. The Pop out button in the new drawer calls `openWindow(session)` to launch a floating window. This preserves the floating-window codepath without making it the default.

### Data flow

```
URL (?status=X&selected=Y) → useSearchParams → SessionsPage state
                          → useSessions({ status: 'all' }) (no polling)
                          → filtered = sessions filtered by status
                          → SessionsGrid renders SessionGridCards (no per-card WebSocket)
                          → if selected: SessionDetailDrawer

Drawer mounted → useSessionTerminal({ sessionId, containerRef, enabled: true })
              → WebSocket /ws → { type: 'attach', sessionId }
              → onmessage: 'output' → xterm.write; 'status' → derived termStatus + state vars
              → term.onData → ws.send { type: 'input', data }
              → unmount / sessionId change → ws.close + term.dispose

Pop out click → openWindow(session) (existing context) → drawer closes via setSelected(null)
              → FloatingSessionWindow renders from layout.tsx, attaches its own WebSocket
              → Brief overlap window during teardown is acceptable (server allows multiple subscribers)
```

### Failure modes

| Scenario | Behavior |
|----------|----------|
| `?selected=X` where X doesn't exist in current filter | `selected` is `null`; drawer doesn't render. URL stays as-is until user changes filter or navigates. |
| `?selected=X` exists in `all` but filter is `active` and X has ended | `selected` is `null`; drawer hidden. User changes filter to see it. |
| WebSocket fails to connect | `termStatus = 'ended'`, dot turns gray (existing behavior preserved by hook). |
| Session ends while drawer open | WebSocket pushes `{ type: 'status', state: 'ended' }`; banner updates; xterm stays mounted with scrollback. |
| Filter changes to `'active'` while drawer shows an ended session | Selection cleared (per `setStatus` logic above). |
| Pop out clicked → floating window opens → drawer closes | Both call into the same `openWindow` / `closeWindow` plumbing; the floating window takes over the WebSocket attach. **Two attaches against the same session-id are allowed** — the server's `/ws` handler already supports multiple subscribers (existing behavior). The drawer's WebSocket is closed by the hook's cleanup when the drawer unmounts, so there's at most one active drawer attach + one floating attach at a time. |
| User refreshes `/sessions?selected=X` | URL state is preserved, drawer reopens, terminal attaches fresh. No stored scrollback (acceptable — same as floating window today). |
| Two browser tabs both open the same `?selected=X` | Both attach independently; server allows multiple subscribers. |
| Sessions list refetches and a card the user is hovering shifts position | Acceptable — same as today's dashboard. |

### Testing

**Unit tests (vitest, react-testing-library):**

- `tests/hooks/useSessionTerminal.test.ts`
  - Initial state: `termStatus === 'connecting'`, no WebSocket open until `enabled = true`
  - When `enabled` flips to true: sends `{ type: 'attach', sessionId }` on WS open
  - Writes `'output'` messages to terminal (assert via mocked term.write spy)
  - On `'status'` messages, sets `sessionState`/`sessionReason`/`sessionMessage`/`sessionProvider`/`retryAfter`; `termStatus` is derived
  - WebSocket `onerror` sets `termStatus = 'ended'`
  - Tears down (closes WS, disposes term, disconnects observer) when `enabled` flips to false, on `sessionId` change, and on unmount
  - Mock `@xterm/xterm`, `@xterm/addon-fit`, and `globalThis.WebSocket`. There is no existing precedent test for these in the repo (verified — `LiveRunsSection.test.tsx` does not mock xterm), so the implementer builds the mocks from scratch following the `vi.mock(...)` pattern used elsewhere in `tests/`.

- `components/sessions/__tests__/SessionGridCard.test.tsx`
  - Renders project name, label, phase badge, status pill
  - Stop button visible only when `!ended_at`
  - Stop button calls `useKillSession().mutate(session.id)` AND `e.stopPropagation()` (assert with a parent `onClick` spy)

- `components/sessions/__tests__/SessionDetailDrawer.test.tsx`
  - Renders header with project name, label, phase
  - Pop out button calls `openWindow` and `onClose`
  - Stop button calls `killSession.mutate` and `onClose` (active sessions only — hidden for ended)
  - Escape closes
  - ArrowLeft/ArrowRight navigate (NOT ArrowUp/Down — array-linear within `sessions` prop)
  - Backdrop click closes
  - Mock `useSessionTerminal` (we test the hook separately)

- `app/(dashboard)/sessions/__tests__/page.test.tsx`
  - Renders grid of cards from `useSessions`
  - Filter pill click updates URL via `router.replace` (assert mocked `useRouter`)
  - Selected card click sets `?selected=` in URL
  - Empty state copy matches per filter (active / ended / all)
  - Selection clears when filter excludes the currently-selected session

- Update the rewired call sites' tests:
  - `components/__tests__/DashboardPage.test.tsx` — verify `onOpenTerminal` triggers `router.push('/sessions?selected=...')`, not `openWindow`. Existing test mocks `useSessionWindows` — switch to mocking `next/navigation`'s `useRouter`.
  - Sidebar test for `ActiveSessionItem` — none exists today. Add one if behavior is non-trivial; otherwise the smoke checklist covers it.
  - `LiveRunsSection.test.tsx` — none exists today. Add a small test asserting the rewire if the existing component has any test infrastructure; otherwise smoke covers it.

**Smoke test (manual, doc only):**

Saved as `docs/superpowers/specs/2026-05-02-sessions-overview-smoke.md`:
1. Visit `/sessions` — see grid of active sessions across all projects (or empty-state copy)
2. Click filter "All" — list expands to include ended sessions
3. Click filter "Ended" — only finished sessions shown
4. Click a card — drawer slides in from right; terminal connects (status dot orange → green when active)
5. Type into the terminal — input is sent and the session echoes / responds
6. Click "Pop out ↗" — drawer closes, floating window opens for same session; both terminals briefly show the same output (expected)
7. Close floating window via its X
8. Open `/sessions?selected=<active-id>` directly via URL — drawer reopens, terminal reattaches fresh
9. While drawer open mid-output, hard-refresh the page — drawer reopens (URL preserved), no console errors, terminal reconnects
10. Click "Stop ⏹" on an active session inside the drawer — session ends, drawer closes, card moves to ended (visible under "All" or "Ended" filter)
11. Sidebar: click any "Active Sessions" entry → navigates to `/sessions?selected=<id>`, drawer opens; sidebar entry shows highlight
12. Dashboard: click "Open Terminal" on any `SessionAgentCard` → same behavior as #11
13. Task drawer Live Runs section: click "Open Terminal" → same behavior
14. With `?status=ended` filter, click an ended session card — drawer attaches; terminal shows whatever the server replays (likely empty or final output snapshot). Confirm no JS errors, just empty/static terminal.

### Migration notes

- `FloatingSessionWindow.tsx` keeps its current shape externally but its xterm/WebSocket logic moves into the new hook. The component becomes a consumer of the hook. This is a pure refactor — no behavior change for floating windows. There are no existing tests targeting `FloatingSessionWindow`'s xterm/WebSocket logic specifically, so no test migration is required, but `DashboardPage.test.tsx` and `LiveRunsSection.test.tsx` must still pass after the rewires (they currently rely on `useSessionWindows().openWindow` being called; they must be updated to assert `router.push` instead).
- No DB migrations.
- No API changes.
- No new dependencies — `@xterm/xterm`, `@xterm/addon-fit`, `@tanstack/react-query` are already used.

### Out of scope (explicitly)

- Saving terminal scrollback across drawer reopens (today's floating window doesn't either).
- Read-only mode for ended sessions (today's floating window doesn't have this).
- Project filter on the page (only status filter; "all projects" is the point of the page).
- Sortable columns or list view — 2-col grid only.
- Bulk actions (stop multiple, etc.).
- Mobile responsive design.

## Open Questions

None — all major decisions made during brainstorming, summarized above.

## Risk Acceptance

- **Two concurrent attaches** (drawer + floating window) are intentional — the server already allows multiple subscribers and we want Pop out to feel instant. No deduplication on the client. Brief output echo in both terminals during the teardown window is expected.
- **No localStorage for filter** — accept that visiting `/sessions` always starts on the `active` filter. URL deep-links handle the deep-linking case.
- **No auto-refresh on `/sessions`** — accept that new sessions appear only on next navigation/refresh. (The dashboard's project-scoped page still polls every 5s for that project's view.) If users complain, add a `pollInterval` arg to `useSessions`.
- **Drawer width 600px on narrow screens** — desktop-only product; acceptable overflow.
- **No "back to project" breadcrumb** when navigating from a project-scoped sidebar to the global `/sessions` — `ProjectRail` and the command palette cover the back-navigation. Other top-level pages follow the same convention.
- **Ended-session terminals attach but may show nothing** — the server's replay behavior for ended sessions is whatever it currently is for floating windows opened on ended sessions. We don't add read-only mode or "no output to replay" copy. Smoke step 14 verifies this is non-broken.
