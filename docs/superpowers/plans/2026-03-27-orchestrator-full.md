# Orchestrator & Full Feature Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the full orchestrator system and all remaining features from task-dashboard to project-control. This includes: per-feature notes, decision feed sidebar, orchestrator data model, risk gate engine, notification service, MCP server, orchestrator watcher, orchestrator session spawn, sessions page UI, per-feature automation levels, and proposed actions.

**Architecture:** Adapted from task-dashboard's orchestrator plan. Key differences: project-control uses `projects` (not `tasks`), features are filesystem-based (ideas/specs/plans), sessions have `project_id` + `source_file` (not `task_id` + `task_source`). The orchestrator watches session exits and drives the Ideas→Specs→Plans→Developing pipeline. MCP server exposes tools to orchestrator sessions. SSE stream pushes decisions to a live feed sidebar.

**Tech Stack:** Next.js 16 App Router, TypeScript, TanStack Query v5, better-sqlite3, node-pty, ws, @modelcontextprotocol/sdk, zod, Tailwind v4, Vitest

**Source plan:** `/home/tomespen/git/task-dashboard/docs/superpowers/plans/2026-03-27-orchestrator.md`

---

## Adaptation notes

| task-dashboard concept | project-control equivalent |
|---|---|
| `task_id` + `task_source` | `source_file` (plan/spec path) |
| `project_path` on session | `project_id` → look up `project.path` |
| `worktree_path` on session | Not used — sessions run in project dir |
| Phase: explore→plan→implement→review | Pipeline: idea→spec→plan→develop |
| `tasks` table | Features derived from filesystem |
| `getAllCachedTasks()` | `buildFeatureMap()` from `lib/dashboard.ts` |

---

### Task 1: Orchestrator data model — new types, tables, CRUD

**Files:**
- Create: `lib/orchestrator-types.ts`
- Modify: `lib/db.ts`
- Create: `tests/lib/db-orchestrator.test.ts`

Types adapted for project-control: no `task_id/task_source`, uses `project_id` and `source_file` instead. `AutomationLevel` stored per-project (not per-task).

### Task 2: Risk gate engine — `lib/orchestrator-gate.ts`

**Files:**
- Create: `lib/orchestrator-gate.ts`
- Create: `tests/lib/orchestrator-gate.test.ts`

Pure function `evaluateRisk(content: string): RiskFlag[]` — detects database migrations, auth changes, breaking changes, test failures.

### Task 3: Notification service — `lib/notifications.ts`

**Files:**
- Create: `lib/notifications.ts`
- Create: `tests/lib/notifications.test.ts`

`NotificationService` with `InAppChannel`, `BrowserDesktopChannel`, `SlackChannel`. Settings: `slack_webhook_url`, `notifications_enabled`.

### Task 4: MCP server + tool implementations

**Files:**
- Create: `server/orchestrator-mcp.ts`
- Create: `server/orchestrator-tools.ts`
- Modify: `server.ts` (start MCP server)

9 tools: `list_sessions`, `read_artifact`, `read_progress`, `spawn_session`, `advance_phase`, `pause_session`, `propose_actions`, `log_decision`, `notify`. Adapted for project-control's session model.

### Task 5: Orchestrator watcher + session spawn

**Files:**
- Create: `server/orchestrator-watcher.ts`
- Modify: `lib/session-manager.ts` (event emitter, spawnOrchestratorSession)
- Create: `app/api/orchestrators/route.ts`
- Create: `app/api/orchestrators/[id]/route.ts`

### Task 6: Decision feed sidebar + SSE

**Files:**
- Create: `app/api/orchestrators/decisions/route.ts`
- Create: `app/api/sse/decisions/route.ts`
- Create: `components/OrchestratorFeed.tsx`

### Task 7: Session cards + progress tracking

**Files:**
- Create: `components/SessionCard.tsx`
- Modify: `lib/db.ts` (add `progress_steps` to sessions)

### Task 8: Proposed actions API + UI

**Files:**
- Create: `app/api/sessions/[id]/proposed-actions/[actionId]/execute/route.ts`
- Create: `app/api/sessions/[id]/proposed-actions/[actionId]/route.ts`

### Task 9: Per-feature automation levels + UI

**Files:**
- Create: `app/api/projects/[id]/automation-level/route.ts`
- Modify: dashboard page or settings

### Task 10: Sessions page — multi-project view

**Files:**
- Create: `app/(dashboard)/sessions/page.tsx`
- Modify: `components/nav/TopNav.tsx` (add Sessions link)

### Task 11: Per-feature notes

**Files:**
- Create: `app/api/notes/route.ts`
- Create: `hooks/useNotes.ts`
- Modify: `components/FileDrawer.tsx` (add notes textarea)

---

This plan is intentionally high-level. Each task will be dispatched as a subagent with full code from the task-dashboard plan, adapted for project-control's data model.
