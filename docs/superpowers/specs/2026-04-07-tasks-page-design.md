# Tasks Page Design

Port the task-dashboard's main dashboard into project-control as a new project-scoped page showing external tasks from configured sources (Jira, Monday.com, DoneDone, GitHub).

## Navigation

Add "Tasks" to the sidebar primary nav section, between "Inbox" and the Pipeline section. Uses `NavItem` with a badge showing total external task count. Route: `/projects/[projectId]/tasks`.

## Page route

`app/(dashboard)/projects/[projectId]/tasks/page.tsx` — client component that renders `ExternalTaskDashboard`.

## API route

`app/api/projects/[id]/external-tasks/route.ts`

- GET handler that reads the project's task source configs from SQLite, then calls each active adapter's `fetchTasks()` directly (like task-dashboard does — live fetch, not reading synced rows)
- Returns `{ tasks: ExternalTask[], errors: string[] }`
- Each adapter call is wrapped in `Promise.allSettled` so one source failing doesn't block others
- Uses the existing `getTaskSourceConfig`, `listTaskSourceConfigs`, and `getTaskSourceAdapter` from `lib/taskSources/`

## Types

`lib/types/externalTask.ts` — the canonical external task shape matching task-dashboard's `Task` interface:

```ts
export type ExternalTaskSource = 'jira' | 'monday' | 'donedone' | 'github'
export type ExternalTaskStatus = 'todo' | 'inprogress' | 'review' | 'blocked' | 'done'
export type ExternalTaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type ExternalTask = {
  id: string
  source: ExternalTaskSource
  url: string
  title: string
  description: string | null
  status: ExternalTaskStatus
  rawStatus?: string
  priority: ExternalTaskPriority | null
  project: string
  labels: string[]
  assignees: string[]
  dueDate: string | null
  createdAt: string | null
  updatedAt: string | null
  meta: Record<string, unknown>
}
```

The existing adapters return `ExternalTask` (from `lib/taskSources/adapters/types.ts`) which has a subset of these fields. The API route maps adapter output to this richer type, pulling additional fields (dueDate, assignees, createdAt, updatedAt, rawStatus) from `ext.meta` where available.

## Components

All in `components/tasks/`:

### ExternalTaskDashboard.tsx
Main orchestrator component. Ported from task-dashboard's `TaskDashboard.tsx`.

- Fetches from `/api/projects/[id]/external-tasks` via SWR (not TanStack Query — project-control uses SWR)
- Auto-refresh on configurable interval (default 120s)
- State: groupBy mode, filters, selected task, overdue toggle
- GroupBy modes: severity, source, status, project, flat, assignee, kanban, focus
- Toolbar: priority summary badges, group-by toggle strip, refresh button, last-updated timestamp
- Renders grouped sections or delegates to KanbanBoard/FocusQueue

### ExternalTaskCard.tsx
Ported from task-dashboard's `TaskCard.tsx`, simplified (no session/Claude launch features).

Displays:
- Source badge (Jira/Monday/DoneDone/GitHub) with colored pill
- Priority dot + label
- Task title (2-line clamp)
- Meta row: project name, status badge with icon, due date (with overdue/today styling)
- Assignees
- Actions row: "Open" link to source URL, labels as tag pills

### ExternalTaskFilters.tsx
Ported from task-dashboard's `TaskFilters.tsx`.

- Text search input
- Source toggle pills (Jira, Monday, DoneDone, GitHub)
- Status toggle pills (Todo, In Progress, Review, Blocked, Done)
- Priority toggle pills (Critical, High, Medium, Low, None)
- Due date presets (Any, Overdue, Today, This week, No date)
- Result count + clear button
- Filter state persisted to sessionStorage

### ExternalTaskDetailDrawer.tsx
Ported from task-dashboard's `TaskDetailDrawer.tsx`, simplified.

- Slide-in drawer from right (like task-dashboard)
- Full task details: title, description (rendered as markdown), source badge, status, priority, project, labels, assignees, dates
- Prev/next navigation between tasks
- "Open in [Source]" link
- Close on Escape key

### ExternalStatsBar.tsx
Ported from task-dashboard's `StatsBar.tsx`.

- Horizontal bar showing status counts with colored dots
- Clickable to filter by status

### ExternalKanbanBoard.tsx
Ported from task-dashboard's `KanbanBoard.tsx`.

- 5 columns: Todo, In Progress, Review, Blocked, Done
- Each column shows task mini-cards
- Column headers with count badges
- No drag-and-drop (task-dashboard doesn't have it either)

### ExternalFocusQueue.tsx
Ported from task-dashboard's `FocusQueue.tsx`.

- Ranked list of tasks by scoring algorithm
- "Suggested next" badge on top item
- Compact row format with rank number, source, priority, title

## Supporting libs

`lib/externalTasks/`:

- `taskStyles.ts` — source badge colors, status colors/labels, priority colors/labels (ported from task-dashboard's `lib/task-styles.ts`)
- `taskScoring.ts` — focus queue ranking algorithm (ported from task-dashboard's `lib/task-scoring.ts`)
- `dueDate.ts` — overdue/today/stale detection (ported from task-dashboard's `lib/due-date.ts`)
- `errorHints.ts` — user-friendly error messages for adapter failures (ported from task-dashboard's `lib/error-hints.ts`)

## Styling

All components use project-control's existing design tokens (`bg-bg-base`, `text-text-primary`, `border-border-default`, etc.) and Tailwind classes. The dark zinc-based palette from task-dashboard maps naturally to project-control's theme. Source badge colors and status colors are kept consistent with task-dashboard.

## What is NOT included

- Session launching / Claude integration
- Webhooks (Jira, GitHub, Slack)
- Orchestrator feed / decisions
- Artifact search / viewer
- Task notes / correction notes
- Phase progress bars
- PR status tracking
- Command palette (project-control may add its own later)
- Settings page (project-control already has TaskSourceSettings)
