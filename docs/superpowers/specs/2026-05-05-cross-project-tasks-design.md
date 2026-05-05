# Cross-Project Tasks Page Design

A top-level `/tasks` page that aggregates external tasks across **all** projects' active source configs into one view. Sibling to `/briefing` and `/sessions`. Reuses the existing `ExternalTaskDashboard` component with a small refactor to accept an optional API URL prop.

## Why

The existing project-scoped Tasks page at `/projects/[id]/tasks` works well within one project, but the user often wants the "what's on my plate today across everything" view. Briefing summarises top-level tasks but doesn't surface external sources. This slice gives the cross-project unified queue.

## Scope

In:
- New top-level page `/tasks` rendering ExternalTaskDashboard
- New API `GET /api/tasks` aggregating across all projects' active source configs
- Each task carries an `ownerProject: { id, name }` field so cross-project cards show which project-control project the task belongs to
- Sidebar Global section gets a "Tasks" item alongside "Briefing"
- Refactor: `ExternalTaskDashboard` accepts an optional `apiUrl` prop; falls back to project-scoped URL via `useParams` when omitted (preserves existing /projects/[id]/tasks behavior)

Out:
- Internal task surfacing on this page (briefing already surfaces those)
- Reflective signal integration on cards (next_actions, grades) — defer; the cross-project view is the value, signal overlay can be a follow-up
- Real-time updates (SWR's existing 120s autoRefresh in ExternalTaskDashboard is sufficient)

## Architecture

```
/tasks (top-level)
  └─ <ExternalTaskDashboard apiUrl="/api/tasks" />
     └─ SWR → /api/tasks
        └─ for each project with active configs:
              for each active config:
                  adapter.fetchTasks(...)
              attach prep state from tasks table
              tag each task with ownerProject {id, name}
        └─ Promise.allSettled — partial failure is per-project, surfaced in errors[]
```

## File structure

| File | Status |
|---|---|
| `app/(dashboard)/tasks/page.tsx` | NEW — page shell |
| `app/api/tasks/route.ts` | NEW — cross-project aggregator |
| `app/api/tasks/__tests__/tasks.test.ts` | NEW — API tests |
| `lib/types/externalTask.ts` | MODIFY — add `ownerProject?: { id: string; name: string }` |
| `components/tasks/ExternalTaskDashboard.tsx` | MODIFY — accept optional `apiUrl` prop |
| `components/tasks/ExternalTaskCard.tsx` | MODIFY — show owner project name when present |
| `components/layout/Sidebar.tsx` | MODIFY — add Tasks NavItem in Global section (next to Briefing) |

No new components. No migrations.

## API route shape

```ts
// app/api/tasks/route.ts
export const dynamic = 'force-dynamic'

export async function GET() {
  const db = getDb()
  const projects = db.prepare(`SELECT id, name FROM projects WHERE is_deleted = 0 OR is_deleted IS NULL`).all() as Array<{ id: string; name: string }>

  const perProject = await Promise.allSettled(
    projects.map(async (proj) => {
      const configs = listTaskSourceConfigs(db, proj.id).filter(c => c.is_active)
      if (configs.length === 0) return { projectId: proj.id, projectName: proj.name, tasks: [] as ExternalTask[], errors: [] as string[] }

      const settled = await Promise.allSettled(
        configs.map(async (cfg) => {
          const adapter = getTaskSourceAdapter(cfg.adapter_key)
          const raw = await adapter.fetchTasks(cfg.config, cfg.resource_ids)
          return raw.map((ext): ExternalTask => mapExtToTask(ext, adapter, cfg))  // same mapping as project-scoped route
        })
      )
      const tasks: ExternalTask[] = []
      const errors: string[] = []
      const adapterNames: Record<string, string> = { jira: 'Jira', monday: 'Monday', donedone: 'DoneDone', github: 'GitHub' }
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i]
        const adapterName = adapterNames[configs[i].adapter_key] ?? configs[i].adapter_key
        if (r.status === 'fulfilled') tasks.push(...r.value)
        else errors.push(`${proj.name} · ${adapterName}: ${(r as PromiseRejectedResult).reason?.message ?? 'Unknown error'}`)
      }
      // Bridge prep state for this project (same query pattern as project-scoped route)
      const prepRows = db.prepare(
        `SELECT source, source_id, prep_notes, prep_status, prepped_at FROM tasks
         WHERE project_id = ? AND is_deleted = 0 AND source IS NOT NULL`,
      ).all(proj.id) as Array<{ source: string; source_id: string; prep_notes: string | null; prep_status: string | null; prepped_at: string | null }>
      const prepBySource = new Map(prepRows.map(r => [`${r.source}:${r.source_id}`, r]))
      for (const t of tasks) {
        const prep = prepBySource.get(`${t.source}:${t.id}`)
        t.prep_notes = prep?.prep_notes ?? null
        t.prep_status = (prep?.prep_status as ExternalTask['prep_status']) ?? null
        t.prepped_at = prep?.prepped_at ?? null
        t.ownerProject = { id: proj.id, name: proj.name }
      }
      return { projectId: proj.id, projectName: proj.name, tasks, errors }
    })
  )

  const allTasks: ExternalTask[] = []
  const allErrors: string[] = []
  for (const r of perProject) {
    if (r.status === 'fulfilled') {
      allTasks.push(...r.value.tasks)
      allErrors.push(...r.value.errors)
    } else {
      allErrors.push(`Project aggregation failed: ${(r as PromiseRejectedResult).reason?.message ?? 'Unknown'}`)
    }
  }
  return NextResponse.json({ tasks: allTasks, errors: allErrors })
}
```

The mapping logic from `app/api/projects/[id]/external-tasks/route.ts` (lines 27-56) should be extracted into a shared helper `mapExtToTask` in `lib/taskSources/mapExtToTask.ts` and reused by both routes. Otherwise both routes duplicate the meta-field extraction logic.

If `is_deleted` doesn't exist on the `projects` table, the query falls back to `SELECT id, name FROM projects` — the implementer should verify and adapt.

## ExternalTaskDashboard refactor

Currently uses `useParams<{ projectId: string }>()` and constructs the URL inline. Refactor:

```tsx
type Props = {
  apiUrl?: string
  showProjectColumn?: boolean
}

export function ExternalTaskDashboard({ apiUrl, showProjectColumn = false }: Props = {}) {
  const params = useParams<{ projectId?: string }>()
  const url = apiUrl ?? (params.projectId ? `/api/projects/${params.projectId}/external-tasks` : null)
  if (!url) return <p className="text-text-muted">No project selected.</p>
  // ...rest unchanged, pass `showProjectColumn` to ExternalTaskCard
}
```

The existing project-scoped page at `/projects/[projectId]/tasks/page.tsx` continues to work without modification (`apiUrl` undefined → falls back to project-scoped URL).

## ExternalTaskCard

Add a small project tag when `task.ownerProject` is present:

```tsx
{task.ownerProject && (
  <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-secondary text-text-muted">
    {task.ownerProject.name}
  </span>
)}
```

Place inside the existing meta row, alongside source badge.

## Page

```tsx
// app/(dashboard)/tasks/page.tsx
'use client'
import { ExternalTaskDashboard } from '@/components/tasks/ExternalTaskDashboard'

export default function CrossProjectTasksPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Tasks</h1>
        <p className="text-sm text-text-secondary mt-1">
          External tasks across all projects.
        </p>
      </div>
      <ExternalTaskDashboard apiUrl="/api/tasks" showProjectColumn />
    </div>
  )
}
```

## Sidebar

Existing Global section (added by slice 2) currently has only "Briefing". Add a second NavItem:

```tsx
<NavItem href="/tasks" active={pathname === '/tasks'}>Tasks</NavItem>
```

## Tests

API route:
- Empty projects table returns empty tasks + empty errors
- One project with one active config returns its tasks tagged with ownerProject
- Multiple projects' tasks aggregate
- One project's adapter throwing produces an error string but does NOT block other projects' tasks
- Prep bridge: a project with a synced tasks row matching `source:source_id` exposes prep_status/prep_notes/prepped_at on the matching ExternalTask

Mock the adapter via `vi.mock('@/lib/taskSources/adapters', () => ({ getTaskSourceAdapter: vi.fn(...) }))` returning a fake adapter.

Component test (Sidebar):
- Tasks link renders in Global section with correct active state on `/tasks`

Existing project-scoped tests (ExternalTaskDashboard) must continue to pass — the apiUrl prop is additive.

Target: ~12-15 new tests on top of 1154 = ~1170 total.

## Migrations

None.

## Risks

- **Cost of cross-project fetch**: N projects × M configs each = NM HTTP calls per request. With SWR's 120s autoRefresh this is bounded. If profiling shows latency issues, add per-config caching at the `taskSources` layer (out of scope for this slice).
- **Adapter rate limits**: Same risk as the project-scoped route, only multiplied. If a user has many projects, rate limits may kick in. Per-project errors don't break the page (graceful degradation).
- **`ownerProject` field type**: Adding to ExternalTask makes it optional everywhere. Existing project-scoped consumers that don't read this field are unaffected; the cross-project page reads it.
