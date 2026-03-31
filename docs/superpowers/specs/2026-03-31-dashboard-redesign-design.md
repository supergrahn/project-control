# Dashboard Redesign Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the empty project landing page with a live Dashboard showing active Claude sessions, and redesign the sidebar to match Paperclip's visual polish and information density.

**Scope:** Option B — Dashboard page + sidebar redesign. Phase pages (ideas/specs/plans/developing/done) are untouched. No backend changes. No new data model.

---

## 1. Visual Language

Paperclip-inspired, already partially in use. Apply consistently:

- **No emoji in navigation.** Colored dots + text only.
- **Avatar initials** in circles for sessions (phase abbreviation: ID/SP/PL/DV/DN).
- **Live indicator:** small green filled dot (6px, `#3a8c5c`), pulsing via CSS animation.
- **Palette:** background `#0d0e10`, surface `#141618`, border `#1e2124`, muted text `#8a9199`, primary blue `#5b9bd5`, green `#3a8c5c`, purple `#8f77c9`, amber `#c97e2a`.
- **Typography:** `system-ui` / `-apple-system` body, `font-family: monospace` for action feed lines.
- **Pill tags** for inline tool calls: small rounded rectangles with category color + truncated filename.

---

## 2. Sidebar Redesign

**File:** `components/layout/Sidebar.tsx` — full rewrite of interior structure.

### Structure (top to bottom)

```
┌─────────────────────────┐
│  [PC] Project Control   │  ← logo mark + app name, 16px bold
├─────────────────────────┤
│  ● Dashboard        [2] │  ← active nav item, live badge (count of active sessions)
│    Inbox                │  ← static for now, no badge
├─────────────────────────┤
│  PIPELINE               │  ← section label, 10px uppercase muted
│    Ideas           3 ●  │  ← count right-aligned, live dot if any active session
│    Specs           1    │
│    Plans           2 ●  │
│    Developing      1 ●  │
│    Done           14    │
├─────────────────────────┤
│  PROJECTS               │
│  ● project-control      │  ← colored dot, current project highlighted
│  ● other-repo           │
├─────────────────────────┤
│  TOOLS                  │
│    Terminal             │
│    Git                  │
├─────────────────────────┤
│  + Add Project          │  ← bottom fixed, opens NewProjectModal
│  [TM] tomespen          │  ← user avatar initials + username
└─────────────────────────┘
```

### Behavior

- Pipeline counts come from existing `/api/tasks?projectId=X` filtered by status — already fetched.
- Live dot beside pipeline item if any session's phase maps to that status (reuse `STATUS_TO_SESSION_PHASES` from `lib/taskPhaseConfig.ts`).
- Dashboard live badge = count of sessions where `ended_at IS NULL`.
- Active nav item uses a left-border highlight (`border-left: 2px solid #5b9bd5`) + slightly lighter background.
- Projects list: each project gets a deterministic color dot (cycle through 5 palette colors by index). Clicking a project navigates to its dashboard.
- "Add Project" button is `position: sticky; bottom: 0` inside the sidebar scroll container.

---

## 3. Dashboard Page

**File:** `app/(dashboard)/projects/[id]/page.tsx` — currently a redirect or empty; replace with full dashboard.

### Layout

Three columns:

```
┌──────────┬────────────────────────┬──────────┐
│  Sidebar │    Main content        │ Activity │
│  (196px) │    (flex-grow)         │  (248px) │
└──────────┴────────────────────────┴──────────┘
```

The Activity panel is **Dashboard-only** — rendered inside `page.tsx`, not in the shared layout.

### Main content sections

**Live Sessions** (header + session count)
- Grid of `SessionAgentCard` components, one per active session (ended_at IS NULL).
- If no active sessions: empty state — "No active sessions" muted text + a "Start a session" hint.

**Waiting** (header, shown only if there are tasks with no active session)
- Compact task grid (2–3 columns), each cell showing task title + phase progress bar.
- Reuses existing task data; no new API.

---

## 4. SessionAgentCard

**File:** `components/dashboard/SessionAgentCard.tsx` — new component.

```
┌────────────────────────────────────────────────┐
│ [SP] Redesign dashboard  ●Live   spec          │
│ task: UI-redesign / speccing                   │
├────────────────────────────────────────────────┤
│ WRITE   components/Sidebar.tsx                 │
│ BASH    npm test                               │
│ READ    docs/spec.md                           │
│ WRITE   app/dashboard/page.tsx                 │
├────────────────────────────────────────────────┤
│ [Open Terminal]              [Stop]            │
└────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface SessionAgentCardProps {
  session: Session          // id, project_id, phase, status, label, created_at, ended_at
  task?: Task               // optional — matched by phase/project
  activeSessionId: string
}
```

**Avatar:** 2-letter initials from phase (`ideate→ID`, `spec→SP`, `plan→PL`, `develop→DV`), background color from `PHASE_CONFIG[status].bgColor`, text from `PHASE_CONFIG[status].color`.

**Live badge:** green dot + "Live" if `!session.ended_at`, else grey "Finished".

**Action feed:** last 5 events from `useOrchestratorFeed(session.id)`. Each event renders as a pill:
- `tool_use` where tool=`Write` → blue pill, `WRITE  <filename>`
- `tool_use` where tool=`Bash` → amber pill, `BASH  <command truncated>`
- `tool_use` where tool=`Read` → muted pill, `READ  <filename>`
- `tool_result` where content contains "done" → green `DONE` pill
- Other events → muted text line, truncated to 60 chars

**Buttons:** Open Terminal (calls `openWindow` from `useSessionWindows`) and Stop (DELETE `/api/sessions/:id` then revalidate). Both already implemented in `TaskDetailView` — extract shared logic to `lib/sessionActions.ts`.

---

## 5. ActivityPanel

**File:** `components/dashboard/ActivityPanel.tsx` — new component.

Two sections, stacked vertically, scrollable independently.

### Actions Required

Derived from task states — no new API needed:
- Tasks in `planning` status with a `plan_file` set → "Plan ready to review" (purple tag)
- Tasks in `developing` status with no active session → "Session ended, check output" (amber tag)
- Any other heuristic surfaced later without backend change

Each item: task title + color tag + "View" link to phase page.

### Live Feed

Aggregated real-time events across all active sessions for the current project.

- Subscribe to each active session's WebSocket (`ws://${window.location.host}/api/sessions/:id/ws`)
- Render events in reverse-chronological order (newest at top)
- Each entry: `[SP] 2s ago  WRITE components/Sidebar.tsx`
- Avatar initials identify which session emitted the event
- Cap at 100 entries in memory; oldest dropped as new arrive

**File:** `hooks/useProjectFeed.ts` — new hook managing multi-session WebSocket subscriptions for a project.

---

## 6. NewProjectModal

**File:** `components/projects/NewProjectModal.tsx` — replaces or wraps the existing add-project flow.

Triggered by "Add Project" button in sidebar bottom.

### Fields

| Field | Type | Notes |
|-------|------|-------|
| Project name | text input | Auto-populated from repo directory name on path selection |
| Git repo path | text input + Browse button | Must be an existing directory; validated client-side |
| Description | textarea (optional) | Stored in `projects.description` |

### Behavior

- "Browse" button opens a native file dialog via `<input type="file" webkitdirectory>` trick, or user types path directly.
- On path change: fetch `/api/projects/validate-path?path=...` (new lightweight endpoint) to confirm the path is a git repo (`git rev-parse` check). Show inline error if not a git repo.
- On submit: POST `/api/projects` with `{ name, path, description }` — same as current flow.
- On success: navigate to the new project's dashboard + close modal.

**New API endpoint:** `GET /api/projects/validate-path?path=<encoded>` — returns `{ valid: boolean, name: string }` (name = `basename` of path). Uses `execFileSync('git', ['-C', path, 'rev-parse', '--git-dir'])`.

---

## 7. Shared Extraction

**File:** `lib/sessionActions.ts` — new file extracting logic reused across Dashboard + phase pages:

```typescript
export async function stopSession(sessionId: string): Promise<void>
export function buildSessionWindow(session: Session, task?: Task): SessionWindow
```

These currently live inline in `TaskDetailView`. Extracting avoids duplication now that both the card and detail view need them.

---

## 8. Data Flow

```
Dashboard page
├── useActiveSessions(projectId)        → sessions[]
├── useTasks(projectId)                 → tasks[] (for "Waiting" grid + Actions Required)
│
├── SessionAgentCard (per session)
│   └── useOrchestratorFeed(sessionId) → tool events (existing hook)
│
└── ActivityPanel
    ├── useProjectFeed(sessions[])      → aggregated WS events (new hook)
    └── tasks[]                         → Actions Required heuristics (passed as prop)
```

No new database tables. No changes to existing API routes except:
- `GET /api/projects/validate-path` — new, read-only
- `app/(dashboard)/projects/[id]/page.tsx` — content replaces redirect

---

## 9. File Summary

| Action | File |
|--------|------|
| Rewrite | `app/(dashboard)/projects/[id]/page.tsx` |
| Rewrite | `components/layout/Sidebar.tsx` |
| Create | `components/dashboard/SessionAgentCard.tsx` |
| Create | `components/dashboard/ActivityPanel.tsx` |
| Create | `components/projects/NewProjectModal.tsx` |
| Create | `hooks/useProjectFeed.ts` |
| Create | `lib/sessionActions.ts` |
| Create | `app/api/projects/validate-path/route.ts` |

---

## 10. Out of Scope (this pass)

- Phase page restyling (Paperclip card layout, inline feeds on task cards)
- Agents as a first-class data entity
- Inbox functionality
- Tools section wiring
- Mobile/responsive layout
