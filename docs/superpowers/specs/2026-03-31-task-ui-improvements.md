# Task UI Improvements (Track A)

**Goal:** Upgrade the task experience with a properties panel, inline live runs, agent todo tracking, and a richer create-task modal.

---

## Data Model

Three new columns on the `tasks` table, added via `ALTER TABLE` migration:

| Column | Type | Default | Notes |
|---|---|---|---|
| `priority` | TEXT | `'medium'` | `low` / `medium` / `high` / `urgent` |
| `labels` | TEXT | `NULL` | JSON array of strings, e.g. `'["backend","auth"]'` |
| `assignee_agent_id` | TEXT | `NULL` | FK to agents table (Track C); nullable |

The PATCH endpoint (`app/api/tasks/[id]/route.ts`) is extended to allow patching `priority`, `labels`, and `assignee_agent_id` alongside the existing allowed fields. The POST endpoint (`app/api/tasks/route.ts`) is also updated to accept these fields on creation so the "Start now" flow can create a fully-configured task in one request.

---

## Task Detail Layout

Two-column layout replacing the current full-width inline view.

### Left column (flex: 1, scrollable)

- Back button + breadcrumb at top
- Task title (editable inline on blur)
- Description (editable textarea, plain text, ~4 rows, saves on blur)
- **Live Runs section** — see below
- **Agent Tasks checklist** — see below
- Placeholder divider labelled "Comments" (not implemented, reserved for future)

### Right panel (260px, fixed, not scrollable)

| Field | Type | Notes |
|---|---|---|
| Status | Dropdown | Current phase: Idea / Speccing / Planning / Developing / Done. Calls existing PATCH status endpoint. |
| Priority | Segmented selector | Low / Medium / High / Urgent. Color-coded chips (Low: `#5a6370`, Medium: `#5b9bd5`, High: `#c97e2a`, Urgent: `#c04040`). |
| Labels | Tag input | Type a string + Enter to add. Click × to remove. Stored as JSON array. |
| Assignee | Dropdown | Lists agents. Empty state: "No agents configured yet." Wired up in Track C. |
| — | Divider | — |
| Created | Read-only | Formatted date |
| Updated | Read-only | Formatted date |

### RightDrawer changes

The existing `RightDrawer` component keeps the **Artifacts** and **Notes** tabs unchanged. The **Sessions** tab becomes history-only: shows past sessions with timestamps and phase labels, but no live streaming output. The streaming that currently lives in the sessions drawer is promoted to the task detail's Live Runs section.

---

## Live Runs Section

Appears in the left column below the description. Subscribes to the active session for this task via the existing WebSocket at `ws://{host}/api/sessions/{sessionId}/ws`.

**Active state:**
- Dark terminal-style scrolling output panel (max-height ~240px, `overflowY: auto`)
- Auto-scrolls to bottom on new output
- **Stop** button — calls `DELETE /api/sessions/{sessionId}`
- **Open terminal** button — triggers the existing `FloatingSessionWindow` for this session
- Session label and phase badge in the header

**Inactive state:**
- Muted "No active run" placeholder

The active session for the task is determined by fetching `GET /api/sessions?taskId={taskId}&status=active` — the first result is the live session. The sessions API already supports `taskId` filtering (`SELECT * FROM sessions WHERE task_id = ?`). The `status=active` filter must be added as part of this track (see File Map).

---

## Agent Tasks Checklist

Appears directly below the Live Runs output panel when an active session is running.

**Parsing:**
Claude Code emits `TodoWrite` tool output as a line in the stream. The exact format should be verified against real Claude Code output during implementation, but the expected pattern is:

```
TodoWrite · [{"id":"...","content":"...","status":"completed"|"in_progress"|"pending"}, ...]
```

Parse with a regex on each incoming WebSocket message:

```typescript
const match = text.match(/^TodoWrite\s+·\s+(\[.+\])/)
if (match) {
  try { setTodos(JSON.parse(match[1])) } catch {}
}
```

State is reset to `[]` when the session ends.

**Display:**
- Section label: "Agent Tasks"
- Completed: greyed text, strikethrough
- In-progress: highlighted with the phase color, bold
- Pending: muted

**Dashboard integration:**
`SessionAgentCard` subscribes to the same WebSocket stream (already does via `ws.onmessage`). When todos are parsed, a progress pill is added next to the Live badge: e.g. `3 / 5` in the phase color. Hidden when no todos are present.

---

## Create Task Modal

Replaces `NewTaskModal` everywhere it is currently used. New filename: `components/tasks/CreateTaskModal.tsx`. The old `NewTaskModal.tsx` is deleted.

**Layout:** Centered modal, max-width 560px, same dark palette as the rest of the app.

**Fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Title | Text input | Yes | Autofocused on open |
| Description | Textarea | No | ~4 rows |
| Priority | Segmented selector | No | Default: Medium |
| Labels | Tag input | No | Enter to add, × to remove |
| Assignee | Dropdown | No | Lists agents; "No agents configured yet" if empty |

**Buttons:**
- `Save` — creates task with current field values, closes modal, task appears in list
- `Start now` — creates task + immediately spawns a session for its current phase (idea → brainstorm session), navigates to the task detail page. If no providers are configured, `Start now` is disabled and shows a tooltip: "No providers configured — add one in Settings → Providers."

**Keyboard:**
- `Escape` closes
- `Enter` in title field moves focus to description
- `Cmd/Ctrl + Enter` submits as Save

---

## File Map

| Action | File |
|---|---|
| Modify | `lib/db/tasks.ts` — add `priority`, `labels`, `assignee_agent_id` + migration |
| Modify | `app/api/tasks/[id]/route.ts` — allow PATCH of new fields |
| Modify | `app/api/tasks/route.ts` — include new fields in GET/POST responses |
| Modify | `app/api/sessions/route.ts` — add `status=active` filter when `taskId` provided |
| Rewrite | `components/tasks/TaskDetailView.tsx` — two-column layout with properties panel |
| Create | `components/tasks/PropertiesPanel.tsx` — right panel component |
| Create | `components/tasks/LiveRunsSection.tsx` — WebSocket stream + todo parsing |
| Modify | `components/tasks/RightDrawer.tsx` — Sessions tab becomes history-only |
| Delete | `components/tasks/NewTaskModal.tsx` |
| Create | `components/tasks/CreateTaskModal.tsx` — full replacement modal |
| Modify | `components/tasks/TaskCard.tsx` — add priority chip below the title |
| Modify | `components/dashboard/SessionAgentCard.tsx` — todo progress pill |
| Modify | `app/(dashboard)/projects/[projectId]/ideas/page.tsx` — use CreateTaskModal |
| Modify | `app/(dashboard)/projects/[projectId]/specs/page.tsx` — use CreateTaskModal if applicable |

---

## Testing

- PropertiesPanel: renders all fields, PATCH called on change for each field
- LiveRunsSection: parses TodoWrite messages, resets on session end, shows inactive state
- CreateTaskModal: Save creates task, Start now creates + spawns session, Escape closes, keyboard navigation
- SessionAgentCard: shows todo progress pill when todos present, hidden otherwise
- TaskDetailView: two-column layout renders, back button works, title/description editable
