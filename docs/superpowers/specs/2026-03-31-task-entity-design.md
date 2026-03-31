# Task Entity Design Spec
**Date:** 2026-03-31  
**Status:** Draft — awaiting review

---

## Overview

Migrate project-control from a folder-per-phase model (ideas dir, specs dir, plans dir) to a unified **Task** entity that accumulates artifact references as it moves through the pipeline. Tasks persist permanently as institutional memory. Phase views remain as filtered lenses on the task list.

The driving insight: the pipeline is not a series of containers. It is a series of states on a single entity. Each phase adds an artifact and the context from all prior phases is automatically available to the next agent session.

---

## Core Concept: Task as Handoff Document

A task is the accumulating story of a feature from idea to shipped code. Each agent session that works on the task receives everything the prior sessions produced — automatically, not by manual context assembly.

When a develop session launches on a task that has passed through all prior phases, it receives:

```
## Idea
{idea_file content}

## Spec  
{spec_file content}

## Plan
{plan_file content}

## Git History
{recent commits}

## Project Memory
{memory files}

## Correction Notes
{any notes flagged during review}
```

The session launcher reads task refs and assembles this context. No manual preparation required.

---

## Data Model

### New: `tasks` table

```sql
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'idea',
  idea_file   TEXT,
  spec_file   TEXT,
  plan_file   TEXT,
  dev_summary TEXT,
  commit_refs TEXT,   -- JSON array of commit hashes
  doc_refs    TEXT,   -- JSON array of file paths
  notes       TEXT,   -- correction notes, injected into next session prompt
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
)
```

**Status values:** `idea` | `speccing` | `planning` | `developing` | `done`

Tasks are never deleted. Status is the only thing that changes as a task progresses. Done tasks stay permanently as reference.

### Modified: `sessions` table

Add one column:

```sql
ALTER TABLE sessions ADD COLUMN task_id TEXT REFERENCES tasks(id);
```

Sessions already have `source_file` and `phase`. `task_id` links a session to its parent task. Multiple sessions can belong to the same task (e.g., two spec sessions, one plan session).

### Existing files stay in place

Markdown files in `ideas_dir`, `specs_dir`, `plans_dir` are not moved. The task record points to them by absolute path. Frontmatter on the files is kept for backwards compatibility but the task record becomes authoritative for cross-phase linking.

### Migration

A one-time migration runs via `POST /api/migrate/tasks`. It scans all three directories for each project, matches files by the existing key logic (stripped date prefix), and creates task records linking the matched files. Unmatched files (idea with no spec, etc.) create partial task records at the appropriate status. The migration is idempotent — running it twice produces no duplicates. A "Run Migration" button is exposed in project Settings.

---

## Phase Views

The existing `/ideas`, `/specs`, `/plans`, `/developing` routes remain. They become filtered queries on the tasks table rather than directory scans.

| Route | Filter |
|---|---|
| `/ideas` | `status = 'idea'` |
| `/specs` | `status = 'speccing'` |
| `/plans` | `status = 'planning'` |
| `/developing` | `status = 'developing'` |
| `/done` | `status = 'done'` |

The kanban view shows all statuses as columns simultaneously.

---

## Task Card Design

Cards use a Paperclip-inspired layout. Every card, regardless of phase, shows the last session action in real-time if a session is active, or the historical last action if not.

**Card anatomy:**
- Phase icon + label (top left) with pulsing live indicator if session is active
- Timestamp (top right)
- Task title
- **Last Action block** — monospace, colored by action type (Write/Edit/Bash/Read), updates in real-time via WebSocket subscription when session is active; frozen to last value when session ends
- 4-segment pipeline strip — each segment colored by phase completion state
- Primary action button (phase-appropriate: Start Spec / Start Plan / Start Dev / View History)

**Live indicator behavior:** The live badge and card border glow appear on any card with an active session, regardless of phase. An idea card can be live during brainstorming. A plan card can be live during planning.

**Real-time feed:** Cards with an active `session_id` open a WebSocket to `/sessions/:id`, parse the stream for tool use events, and update the Last Action block as new events arrive. On session end, the last value is persisted to `sessions.progress_steps` and rendered statically on remount.

**Phase colors:**
- Idea: blue `#5b9bd5`
- Spec: green `#3a8c5c`
- Plan: purple `#8f77c9`
- Developing: amber `#c97e2a`
- Done: muted green `#3a8c5c` at reduced opacity

---

## Three-Panel Layout

```
┌──────────────┬──────────────────────────┬─────────────┐
│  Left        │  Center                  │  Right      │
│  Sidebar     │  Content                 │  Drawer     │
│  200px       │  flex: 1                 │  210px      │
└──────────────┴──────────────────────────┴─────────────┘
```

The right drawer is contextual — it shows task details when a task is open, and collapses or shows project-level info otherwise.

### Left Sidebar (persistent)

- **Project switcher** — current project name + path, click to open project modal
- **Git context** — branch, last commit time, uncommitted file count
- **Pipeline nav** — Ideas / Specs / Plans / Developing / Done with counts; active route highlighted; Developing shows pulsing dot + count if any session is live
- **Active Sessions** — compact cards for each running session, showing task name, phase, and elapsed time; click to jump to the task
- **Bottom tools** — Memory, Search, Settings

### Center (content area)

Phase views render the card grid here. When a task is opened (clicked), the center transitions to the **Task Detail View**.

### Right Drawer (task-contextual)

Visible when a task is open. Contains:

- **Status badge** + created date + total session count
- **Artifacts** — links to each phase file (idea.md, spec.md, plan.md, dev_summary.md, docs) with ↗ to open in file drawer
- **Session History** — all sessions for this task, grouped by phase, showing duration, action count, live indicator for active session
- **Notes** — correction notes field, free-text, injected into next session prompt

---

## Task Detail View (Center)

Opened by clicking any task card. Replaces the center content area.

**Header:** breadcrumb (project / task-id), task title, live status badge if active, overflow menu.

**Pipeline strip:** 5-segment bar showing completion across all phases.

**Phase timeline:** Vertical list of phase rows, each collapsible.
- Completed phases: collapsed by default, show filename and date. Expand to show artifact content preview and session log summary.
- Active phase: expanded, shows real-time action feed (timestamp + tool call per line), most recent line highlighted with pulsing dot. Open Terminal and Stop buttons.
- Pending phases: dashed border, low opacity.

**Real-time feed in detail view:** Same WebSocket subscription as cards, but shows the full action log for the session rather than just the last line. New actions append to the bottom. Auto-scrolls to latest unless user has scrolled up.

---

## Color Palette

Base: `#0e1012`

| Token | Value | Usage |
|---|---|---|
| `bg-base` | `#0e1012` | Page background |
| `bg-surface` | `#0c0e10` | Sidebar, drawer backgrounds |
| `bg-raised` | `#141618` | Cards, secondary surfaces |
| `border` | `#1c1f22` | All borders |
| `border-subtle` | `#2e3338` | Dividers, section labels |
| `text-primary` | `#e2e6ea` | Headings, active labels |
| `text-secondary` | `#8a9199` | Body text |
| `text-muted` | `#5a6370` | Timestamps, counts |
| `text-faint` | `#454c54` | Labels, placeholders |

Phase accent colors are intentionally saturated against the flat gray base:

| Phase | Color |
|---|---|
| Idea | `#5b9bd5` |
| Spec | `#3a8c5c` |
| Plan | `#8f77c9` |
| Developing | `#c97e2a` |
| Done | `#3a8c5c` @ 60% opacity |

---

## Session Launch: Context Assembly

When launching any session from a task, the launcher:

1. Reads the task record by `task_id`
2. Reads file content for each populated ref (`idea_file`, `spec_file`, `plan_file`)
3. Reads project memory files
4. Reads git history (last N commits)
5. Reads correction notes from the task's notes field
6. Assembles a structured context block and prepends it to the session prompt
7. Creates a session record with `task_id` set
8. Advances `tasks.status` to the new phase only if the new phase is ahead of the current status
9. Updates `tasks.updated_at`

On session end, the launcher reads the output log and updates the relevant `_file` ref on the task (e.g., a completed plan session sets `tasks.plan_file`).

---

## Phase Transition

"Promoting" a task is a status update, not a file operation. The task moves from `idea` → `speccing` when the user clicks "Start Spec" on an idea card. The spec session then runs and produces the spec file, which is written back to `tasks.spec_file` on session end.

Phases can be re-entered. A task in `planning` state can have another spec session run against it — that session's output updates `tasks.spec_file` and the session is added to session history. Running a prior-phase session does not change `tasks.status`. Status only advances forward — a spec session on a planning-state task leaves status as `planning`.

---

## What Does Not Change

- Markdown files remain on disk in their existing directories, git-tracked
- Frontmatter on files is preserved (backwards compatible)
- PTY terminal and WebSocket infrastructure unchanged
- All existing pages and routes continue to work during migration
- Project settings (ideas_dir, specs_dir, plans_dir) remain and are used when writing new files

---

## Out of Scope

- Agent personas / roles (separate future feature)
- Approval inbox / orchestrator changes (separate future feature)
- Goals / objectives layer (separate future feature)
- Routine scheduling (separate future feature)
