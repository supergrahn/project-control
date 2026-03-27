# Daily Workflow Features — Design Spec

**Date:** 2026-03-27

---

## Feature 1: Daily Standup Generator

### Goal
One-click "generate standup" that synthesizes yesterday's events, debriefs, git history, and today's Up Next into a structured daily report.

### How it works

**API:** `GET /api/standup` — pure server-side logic, no LLM call needed.

Assembles:
- **Yesterday:** events from last 24h grouped by project, debrief summaries, git commits
- **Today:** top 5 items from Up Next, any active sessions
- **Blockers:** plans with audit blockers, stale features

**Output format:**
```markdown
# Standup — 2026-03-27

## Yesterday
- **project-control**: Implemented orchestrator MCP server, 9 tools
- **aetherspectra**: Fixed render pipeline memory leak

## Today
- **project-control**: Start developing auth-system (audit clean)
- **ochroma**: Create plan for colour-matching spec

## Blockers
- project-control: auth-plan has 2 audit blockers
```

**UI:** A "Standup" button on the dashboard page header. Clicking it shows a modal with the generated report and a "Copy to clipboard" button.

### Files
- `lib/standup.ts` — `generateStandup(projects, events, dashboardData, gitHistories)`
- `app/api/standup/route.ts` — GET
- `components/StandupModal.tsx` — display + copy

---

## Feature 2: Quick Capture Inbox

### Goal
Capture ideas instantly from anywhere without navigating. A global floating input that creates an idea file in the active project.

### How it works

**Trigger:** `Cmd+I` keyboard shortcut (registered globally in the dashboard layout).

**UI:** A minimal floating input that appears at the top of the screen:
```
┌─────────────────────────────────────────────────────┐
│ 💡 Quick capture: [type your idea...]    [Save] [×] │
└─────────────────────────────────────────────────────┘
```

**Action:** On save, creates a new `.md` file in the active project's `ideas_dir` with the title as the heading. Uses the existing `POST /api/files` endpoint.

**Inbox page enhancement:** Add a "recent captures" section at the top of `/ideas` showing the last 5 quick captures (by creation date).

### Files
- `components/QuickCapture.tsx` — floating input component
- Modify: `app/(dashboard)/layout.tsx` — `Cmd+I` shortcut + QuickCapture render

---

## Feature 3: Project Health Scores

### Goal
A single 0-100 health score per project that combines multiple signals for instant triage. Show on the dashboard and project cards.

### How it works

**Scoring algorithm** (pure function, no LLM):

| Signal | Weight | Scoring |
|--------|--------|---------|
| Audit status | 30 | All clean = 30, warnings = 15, blockers = 0 |
| Pipeline progress | 25 | (plans / max(ideas, 1)) * 25 — more plans = more progress |
| Freshness | 20 | Active in last 24h = 20, last 7d = 10, older = 0 |
| Session activity | 15 | Has active session = 15, session in last 7d = 8, none = 0 |
| Memory coverage | 10 | Has memory files = 10, none = 0 |

**API:** Added to the existing `/api/dashboard` response as `projectScores: Record<string, number>`.

**UI:** Score badge on each project in the dashboard's bottom strip or as a new section. Color-coded: 80+ green, 50-79 amber, <50 red.

### Files
- `lib/health-score.ts` — `calculateHealthScore(project, dashboardData, memoryExists)`
- Modify: `lib/dashboard.ts` — include scores in `DashboardResponse`
- Modify: `app/(dashboard)/page.tsx` — display scores

---

## Feature 4: Git Activity Overview

### Goal
See recent commits, branch info, and uncommitted changes across ALL projects in one view. The "what changed while I was away" view.

### How it works

**Scanner:** `lib/git-activity.ts` runs `git log --oneline -5`, `git branch --show-current`, and `git status --short` for each project. Pure `execFileSync` calls, no LLM.

```typescript
type ProjectGitActivity = {
  projectId: string
  projectName: string
  currentBranch: string | null
  recentCommits: string[]  // last 5 oneline
  uncommittedChanges: number  // count of changed files
  lastCommitAge: string  // ISO timestamp of last commit
}
```

**API:** `GET /api/git-activity` — returns array of `ProjectGitActivity`.

**UI:** A `/git-activity` page with a card per project showing branch, recent commits, and dirty file count. Projects with uncommitted changes highlighted.

### Files
- `lib/git-activity.ts` — `scanGitActivity(projects)`
- `app/api/git-activity/route.ts` — GET
- `hooks/useGitActivity.ts`
- `app/(dashboard)/git-activity/page.tsx`

---

## Feature 5: Kanban Board

### Goal
Visual pipeline view of ALL features across ALL projects. Each column is a pipeline stage (Ideas, Specs, Plans, Developing). Cards can be visually scanned for a "bird's eye" view.

### How it works

**Data source:** Reuses `buildDashboardData()` from `lib/dashboard.ts`. Each feature in the pipeline becomes a card in the appropriate column.

**Columns:**
- **Ideas** — features that only have an idea file
- **Specs** — features that have a spec but no plan
- **Plans** — features that have a plan (grouped: ready to develop, has warnings, has blockers)
- **In Progress** — features with active sessions

**Cards:** Compact cards showing feature name, project name, and audit badge (if applicable).

**No drag-and-drop** — this is a read-only visualization. Actions happen through the existing pipeline (promote files, launch sessions).

### Files
- `app/(dashboard)/kanban/page.tsx` — kanban view
- `hooks/useKanban.ts` — derives kanban columns from dashboard data

---

## Build Order

1. Project Health Scores (modifies existing dashboard — foundation)
2. Daily Standup Generator (uses health scores + events)
3. Quick Capture Inbox (simple, self-contained)
4. Git Activity Overview (independent scanner)
5. Kanban Board (reuses dashboard data)
