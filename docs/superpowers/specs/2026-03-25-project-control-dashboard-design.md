# Project Control Dashboard — Design Spec

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

A local web-based dashboard for managing Claude Code development workflows across multiple projects. Each project has four views — Ideas, Specs, Plans, and Currently Developing — with action buttons that launch Claude Code sessions with targeted prompts. Sessions are interactive via a full-screen xterm.js terminal modal.

---

## Architecture

### Runtime

Single Next.js 15 (App Router) application with a custom `server.ts` entry point. The custom server boots Next.js and attaches a WebSocket endpoint for PTY I/O on the same port. No separate backend process.

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Lucide React, react-markdown + remark-gfm (markdown rendering)
- **Data fetching:** TanStack Query v5 (client-side caching, polling for live session state)
- **Terminal emulation:** xterm.js 6 + @xterm/addon-fit
- **PTY management:** node-pty (stored in `globalThis` maps to survive hot-reload)
- **WebSocket:** ws library, attached to the custom server
- **Database:** better-sqlite3 (SQLite, single file)
- **Runtime:** Node.js with tsx

### Project Structure

```
project-control/
├── server.ts                    # Entry — boots Next.js + WebSocket server
├── lib/
│   ├── db.ts                    # SQLite schema + CRUD helpers
│   ├── session-manager.ts       # node-pty spawning, WebSocket handler, PTY maps
│   ├── project-scanner.ts       # Scans ~/git for project folders
│   └── prompts.ts               # Hardcoded system prompt templates per action type
├── app/
│   ├── api/
│   │   ├── sessions/            # POST launch, GET status, DELETE kill
│   │   ├── projects/            # GET list, GET/POST settings per project
│   │   └── files/               # GET .md files from configured project folders
│   └── (dashboard)/             # UI pages: ideas, specs, plans, developing, settings
└── components/
    ├── SessionModal.tsx          # Full-screen xterm.js terminal modal
    ├── PromptModal.tsx           # Pre-launch action modal
    ├── FileDrawer.tsx            # Right sidebar for full .md content
    └── cards/
        ├── IdeaCard.tsx
        ├── SpecCard.tsx
        ├── PlanCard.tsx
        └── SessionCard.tsx
```

---

## Data Model

All project configuration is stored centrally in a single SQLite database (`data/project-control.db`). Markdown files (ideas, specs, plans) are never stored in the database — they live on disk and are read on demand.

### `projects` table

```sql
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  path       TEXT UNIQUE NOT NULL,  -- absolute path, e.g. /home/tom/git/my-app
  ideas_dir  TEXT,                  -- relative path within project root
  specs_dir  TEXT,
  plans_dir  TEXT,
  created_at TEXT NOT NULL
);
```

### `sessions` table

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  label       TEXT NOT NULL,    -- e.g. "AI Auth System · developing"
  phase       TEXT NOT NULL,    -- 'brainstorm'|'spec'|'plan'|'develop'|'review'
  source_file TEXT,             -- fs.realpathSync()-resolved canonical path to the .md file
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active'|'ended'
  created_at  TEXT NOT NULL
);
```

### `settings` table

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## UI Layout

### Top Navigation Bar

Persistent header across all views:
- App logo + name ("Project Control") on the left
- Project picker dropdown (populates from `~/git` scan + `projects` table) in the center-left
- Tab navigation: **Ideas · Specs · Plans · Developing**
- Settings icon on the right

### Ideas / Specs / Plans Views

All three views share the same structure — only the folder source and card actions differ.

**Layout:** 3-column responsive card grid with a `+ New Idea` / `+ New Spec` / `+ New Plan` button top-right. Clicking `+ New` creates a blank `.md` file in the configured folder (via `POST /api/files`) using a slug derived from a name the user types in a small inline prompt, then immediately opens a brainstorm/spec/plan session for it.

**Card anatomy (footer action bar style):**
- Card body: title (first `# heading` from .md), excerpt (first paragraph), date modified, filename
- Status badge (top-right corner): `idea` / `spec` / `plan`
- Footer strip: contextual action buttons + `⋯` overflow menu
- Clicking the card body opens a **FileDrawer** (right sidebar) with full rendered markdown

**Action buttons per view:**

| View | Actions |
|------|---------|
| Ideas | 💬 Brainstorm · 📋 Create Spec · 🚀 Develop |
| Specs | 📋 Continue Spec · 🗺 Create Plan |
| Plans | 🗺 Continue Planning · 🚀 Start Developing |

### Currently Developing View

Displays all active Claude Code sessions. Includes a **view toggle** (cards / table) in the top-right.

**Card view:** Each session card shows:
- Coloured status dot + "ACTIVE" label + elapsed time (header strip)
- Session label + project name + phase
- Mini terminal preview (last 2 lines of PTY output, streamed via WebSocket)
- Footer: `Open →` button (opens SessionModal) + `Stop` button

**Table view:** Compact sortable list with columns: Name, Project, Phase, Status, Actions.

Sessions refresh via TanStack Query polling every 5 seconds.

### Session Modal

Full-screen overlay opened from any `Open →` button or after launching a new session.

- xterm.js terminal fills the modal body
- Header: session label + status indicator + `Stop Session` button + close (X)
- WebSocket connects on open, re-attaches if session is still running
- Notifies with a status banner when the session ends

### Prompt Modal

Triggered by any action button (Brainstorm, Create Spec, Start Developing, etc.).

- Title: action name (e.g. "📋 Create Spec")
- Subtitle: source file name
- **System prompt** displayed read-only, collapsed by default, expandable via "Show system prompt" toggle
- **Optional context** textarea: "Add your context (optional)"
- **Permission level** selector (only shown for `develop` action):
  - `Ask for each tool` (default) — `--permission-mode default`
  - `Auto-accept file edits` — `--permission-mode acceptEdits`
  - `Bypass all prompts` — `--permission-mode bypassPermissions`; shown with a warning label
- Footer: `Cancel` + `Launch Session →`

On launch, the combined prompt is assembled as:
```
{SYSTEM_TEMPLATE}

{user context if provided}
```

---

## Session & Prompt System

### Claude Binary Resolution

On startup, `session-manager.ts` probes standard paths (`~/.local/bin/claude`, `/usr/local/bin/claude`, etc.) and falls back to `which claude`. Cached as a module-level constant.

### PTY Spawning

Sessions are fully interactive — the user can type follow-up messages in the terminal. The system template and user context are passed as CLI flags/arguments at spawn time (no `proc.write`, no timing races). Verified against the installed Claude Code CLI (`claude --help`):

- `--system-prompt <text>` — sets the session's system prompt (used for the action template)
- `[prompt]` positional arg — initial user turn (used for optional user context; omitted if empty)
- `--session-id <uuid>` — pass our own pre-generated UUID so the DB row and the Claude session share the same ID
- `--permission-mode <mode>` — controls tool permission behaviour

```typescript
const sessionId = crypto.randomUUID()

const args: string[] = [
  '--system-prompt', systemTemplate,
  '--session-id', sessionId,
  '--permission-mode', permissionMode,  // see permission modes below
]

if (userContext.trim()) {
  args.push(userContext)  // positional prompt arg — must be last
}

const proc = pty.spawn(claudeBin, args, {
  name: 'xterm-color',
  cols: 80,   // initial size — frontend sends resize on first connect
  rows: 24,
  cwd: projectPath,
  env: { ...process.env },
})
```

**Permission modes by action type:**

| Action | `--permission-mode` | Rationale |
|--------|-------------------|-----------|
| `brainstorm` | `plan` | Read + plan only; no file writes needed |
| `spec` | `acceptEdits` | Writes .md output file |
| `plan` | `acceptEdits` | Writes .md output file |
| `develop` | `default` (or user-selected) | Full interactive permission prompts |
| `review` | `plan` | Read-only analysis |

For `develop` sessions, the user can override in the Prompt Modal (see UI Layout). Options exposed: `default` (ask per tool), `acceptEdits` (auto-accept file edits only), `bypassPermissions` (bypass all — shown with a warning).

**Prompt safety:** All values are passed as argv array elements, never interpolated into a shell string. No injection risk.

**Session IDs** — passed via `--session-id` at spawn, so the DB row and Claude session share the same UUID.

PTY instances stored in `globalThis.ptyMap: Map<sessionId, IPty>` and WebSocket clients in `globalThis.wsMap: Map<sessionId, Set<WebSocket>>`.

**Output buffer:** `session-manager.ts` maintains a `globalThis.outputBuffer: Map<sessionId, string[]>` — a rolling buffer of the last 100 lines of PTY output per session. New WebSocket clients (e.g. the mini preview on the Developing view, or reopening the SessionModal) receive the buffered lines as a replay burst on connect before live streaming begins. Without this, the mini terminal preview would appear blank until the next PTY output event.

**Orphaned processes:** `server.ts` registers a `SIGTERM`/`SIGINT` handler that iterates `ptyMap` and calls `proc.kill()` on each before exiting, preventing orphaned Claude child processes.

**Terminal resize:** The frontend sends `{ type: 'resize', cols, rows }` immediately on WebSocket connect and on every `window resize` event. The server calls `proc.resize(cols, rows)` to keep the PTY dimensions in sync.

### System Prompt Templates

Hardcoded in `lib/prompts.ts`, one per action type:

| Action | Template focus |
|--------|---------------|
| `brainstorm` | Explore the idea, ask clarifying questions, produce a structured brainstorm .md |
| `spec` | Read the source .md, produce a technical spec covering architecture, components, data flow, edge cases |
| `plan` | Read the spec, produce a step-by-step implementation plan with tasks and sequencing |
| `develop` | Read the plan, implement it, follow CLAUDE.md conventions |
| `review` | Read the implementation, review for correctness, security, and quality |

### Project Scanner

`lib/project-scanner.ts` reads `~/git` directory on demand, returns `{ name, path }[]`. New projects not yet in the DB are shown in the picker with an "Add project" affordance that creates the DB row and opens project settings.

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/projects` | GET | List all configured projects |
| `/api/projects/[id]/settings` | GET / POST | Read/write project folder settings |
| `/api/projects/scan` | GET | Scan `~/git` for folders |
| `/api/files` | GET | Read .md files from a project folder (`?projectId=&dir=ideas`) |
| `/api/files` | POST | Create a new blank .md file in a project folder. If a file with the derived slug already exists, the server appends a numeric suffix (e.g. `my-idea-2.md`) until the name is unique — never overwrites. |
| `/api/sessions` | POST | Spawn new Claude session. Request body: `{ projectId: string, phase: 'brainstorm'\|'spec'\|'plan'\|'develop'\|'review', sourceFile: string, userContext?: string, permissionLevel?: 'ask'\|'bypass' }`. Response: `{ sessionId: string }` on success, `{ error: string }` on failure. |
| `/api/sessions` | GET | List sessions (optionally filter by `?status=active`) |
| `/api/sessions/[id]` | DELETE | Kill session, mark ended |
| `/ws` | WebSocket | Bidirectional PTY I/O |

---

## Error Handling & Edge Cases

- **Claude binary not found:** Show a setup banner in the UI with install instructions.
- **Project folder missing configured dir:** Prompt user to configure it in project settings before showing the view.
- **Session ended while modal open:** Show a "Session ended" banner, offer to close or view output.
- **Server restart:** Sessions marked `active` in DB but absent from `ptyMap` are shown as "disconnected" in the UI (no auto-respawn, unlike task-dashboard, to avoid unintended restarts). Opening a disconnected session's modal shows a "Session ended — output unavailable" message rather than a blank terminal.
- **Concurrent sessions on the same file:** If a session with `status='active'` already exists for a given `source_file` (compared using `fs.realpathSync()`-resolved canonical paths to handle symlinks), clicking an action button on that card shows a warning: "A session is already active for this file. Open it or stop it before starting a new one." The launch is blocked.
- **File read errors:** Cards show an error state inline; the rest of the grid continues to render.
- **`/api/projects/scan` routing:** `scan` is a static route file at `app/api/projects/scan/route.ts`. Next.js resolves static segments before dynamic `[id]` segments, so there is no conflict with `app/api/projects/[id]/settings/route.ts`.

---

## Out of Scope (v1)

- Authentication / multi-user
- Remote project paths
- Session history / logs persistence beyond the current run
- Electron packaging (natural future upgrade path from this architecture)
- User-editable prompt templates (system prompts are hardcoded in v1)
