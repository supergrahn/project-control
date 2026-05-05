# Briefing Surface Design

A top-level `/briefing` page that aggregates the signal already captured by the reflective workflow (next-actions, critic findings, grades, embedding-based dedup hints) plus internal-task ranking, into a single "what's worth doing now" view.

## Why

The reflective workflow infrastructure shipped in 2026-05-02 captures a lot of signal — session grades, structured next-actions, critic findings on specs/plans, embeddings — but most of it lives in panels deep in drawers. The user has to navigate to find it. The briefing surface aggregates these outputs into one cross-project landing page so the user can land in the morning, scan, and pick a focus.

## Scope

In:
- New top-level page at `/briefing`
- Single API endpoint `GET /api/briefing` aggregating five sections
- Cross-project view (no project filter for v1)
- Top-N caps per section (no pagination, no config UI)
- Click-to-navigate per item (uses existing detail pages/drawers)
- Sidebar nav entry

Out:
- Per-project briefing (defer; if needed, route is `/projects/[id]/briefing`)
- Snooze/dismiss actions (no config matrix per user preference)
- External task ranking (would require live adapter calls — defer to slice 3 Tasks page where that fits naturally)
- Real-time updates / WebSocket (60s SWR refresh is enough)
- Customization, sorting, filters (just works; not configurable)

## Architecture

One page, one API route, five aggregator helpers (one per section), one shared SWR hook, five small panel components.

Sections (rendered top-to-bottom in a single column on mobile, two columns on desktop):

| Section | Source | Cap | Sort |
|---|---|---|---|
| Open next steps | `sessions.next_actions` JSON across ENDED sessions in last 14 days | 10 | most recent ended_at first |
| Critic flagged | `critic_findings.findings` JSON, severity in (`critical`, `high`) | 10 | most recent created_at first |
| Tasks worth picking up | `tasks` rows with status in (`idea`, `spec`, `plan`) | 10 | created_at DESC + status weight |
| Recent failures | `sessions` rows where `grade` in (`no`, `partial`) in last 7 days | 10 | graded_at DESC |
| Possible duplicates | `embeddings` rows of kind=`task` cosine pairs > 0.85 | 5 | similarity DESC |

Each section is independently computed; if one query fails, the others still render (`Promise.allSettled` in the API).

### File structure

| File | Purpose |
|---|---|
| `app/(dashboard)/briefing/page.tsx` | NEW — client page, calls `useBriefing` |
| `app/api/briefing/route.ts` | NEW — aggregates and returns JSON |
| `app/api/briefing/__tests__/briefing.test.ts` | NEW — API tests |
| `lib/briefing/openNextActions.ts` | NEW — aggregator |
| `lib/briefing/criticFlagged.ts` | NEW — aggregator |
| `lib/briefing/topTasks.ts` | NEW — aggregator |
| `lib/briefing/recentFailures.ts` | NEW — aggregator |
| `lib/briefing/duplicateTasks.ts` | NEW — aggregator (uses existing `lib/embeddings/search`) |
| `lib/briefing/__tests__/*.test.ts` | NEW — one per aggregator |
| `hooks/useBriefing.ts` | NEW — SWR hook |
| `components/briefing/BriefingPage.tsx` | NEW — layout component |
| `components/briefing/sections/*.tsx` | NEW — one per section |
| `components/briefing/__tests__/BriefingPage.test.tsx` | NEW |
| `components/Sidebar.tsx` | MODIFY — add Briefing nav item |

### Data contracts

```ts
// lib/briefing/types.ts
export type BriefingNextAction = {
  sessionId: string
  sessionLabel: string
  projectId: string
  projectName: string
  taskId: string | null
  sourceFile: string | null
  endedAt: string
  actions: string[]  // top 3 from the parsed JSON
  openQuestions: string[]
}

export type BriefingCriticFlag = {
  projectId: string
  projectName: string
  kind: string  // 'spec' | 'plan'
  ref: string  // file path
  severity: 'critical' | 'high'
  category: string
  message: string
  createdAt: string
}

export type BriefingTopTask = {
  taskId: string
  projectId: string
  projectName: string
  title: string
  status: string
  createdAt: string
}

export type BriefingRecentFailure = {
  sessionId: string
  sessionLabel: string
  projectId: string
  projectName: string
  grade: 'no' | 'partial'
  gradeReason: string | null
  gradedAt: string
}

export type BriefingDuplicate = {
  aTaskId: string
  bTaskId: string
  aTitle: string
  bTitle: string
  projectId: string
  projectName: string
  similarity: number
}

export type Briefing = {
  openNextActions: BriefingNextAction[]
  criticFlagged: BriefingCriticFlag[]
  topTasks: BriefingTopTask[]
  recentFailures: BriefingRecentFailure[]
  duplicateTasks: BriefingDuplicate[]
  generatedAt: string
}
```

### Aggregator query patterns

**Open next steps** (`lib/briefing/openNextActions.ts`):
```ts
SELECT s.id, s.label, s.project_id, p.name AS project_name,
       s.task_id, s.source_file, s.ended_at, s.next_actions
  FROM sessions s
  JOIN projects p ON p.id = s.project_id
 WHERE s.status != 'active'
   AND s.next_actions IS NOT NULL
   AND s.ended_at IS NOT NULL
   AND s.ended_at > ?  -- 14 days ago ISO
 ORDER BY s.ended_at DESC
 LIMIT 30;
```
Then JSON-parse each row's `next_actions`, filter rows whose `next_actions` array is empty, and slice to top 10.

**Critic flagged** (`lib/briefing/criticFlagged.ts`):
```ts
SELECT cf.project_id, p.name AS project_name, cf.kind, cf.ref, cf.findings, cf.created_at
  FROM critic_findings cf
  JOIN projects p ON p.id = cf.project_id
 ORDER BY cf.created_at DESC
 LIMIT 50;
```
JSON-parse `findings` (array of `{severity, category, message}`), flatten and filter to severity in (`critical`, `high`), slice to 10.

**Top tasks** (`lib/briefing/topTasks.ts`):
```ts
SELECT t.id, t.project_id, p.name AS project_name, t.title, t.status, t.created_at
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
 WHERE t.status IN ('idea','spec','plan')
 ORDER BY (CASE t.status WHEN 'plan' THEN 0 WHEN 'spec' THEN 1 ELSE 2 END), t.created_at DESC
 LIMIT 10;
```
"Plan" tasks rank above "spec" above "idea" since plan-ready tasks are closest to executable work. Within each status, most recent first.

**Recent failures** (`lib/briefing/recentFailures.ts`):
```ts
SELECT s.id, s.label, s.project_id, p.name AS project_name,
       s.grade, s.grade_reason, s.graded_at
  FROM sessions s
  JOIN projects p ON p.id = s.project_id
 WHERE s.grade IN ('no','partial')
   AND s.graded_at IS NOT NULL
   AND s.graded_at > ?  -- 7 days ago ISO
 ORDER BY s.graded_at DESC
 LIMIT 10;
```

**Duplicate tasks** (`lib/briefing/duplicateTasks.ts`):
- For each project, query `embeddings` rows of kind='task'
- Compute pairwise cosine similarity for tasks within the same project (no cross-project dedup — different projects have different domains)
- Filter pairs > 0.85, sort DESC, take top 5 globally
- Resolve task titles via JOIN

This is the most compute-heavy of the five. To keep the briefing API fast, the aggregator caps per-project work at 100 task embeddings (the most recent 100). For projects with > 100 tasks the briefing duplicate panel is best-effort, not exhaustive — slice 3's Tasks page is the canonical "find duplicates" surface.

### API route shape

```ts
// app/api/briefing/route.ts
export async function GET(): Promise<NextResponse> {
  const db = getDb()
  const settled = await Promise.allSettled([
    Promise.resolve(getOpenNextActions(db)),
    Promise.resolve(getCriticFlagged(db)),
    Promise.resolve(getTopTasks(db)),
    Promise.resolve(getRecentFailures(db)),
    Promise.resolve(getDuplicateTasks(db)),
  ])
  return NextResponse.json({
    openNextActions: settled[0].status === 'fulfilled' ? settled[0].value : [],
    criticFlagged: settled[1].status === 'fulfilled' ? settled[1].value : [],
    topTasks: settled[2].status === 'fulfilled' ? settled[2].value : [],
    recentFailures: settled[3].status === 'fulfilled' ? settled[3].value : [],
    duplicateTasks: settled[4].status === 'fulfilled' ? settled[4].value : [],
    generatedAt: new Date().toISOString(),
  })
}
```

A single fulfilled-or-empty pattern means a partial DB issue degrades gracefully. The aggregators are sync (`Promise.resolve` wraps them); duplicate detection may be async if cosine compute matters — the wrap is uniform.

### UI

Layout: `BriefingPage` renders a header (`<h1>Briefing</h1>` with a refresh-time indicator) and a 2-column responsive grid (`grid-cols-1 lg:grid-cols-2`). Each section is its own component (`OpenNextActionsSection`, `CriticFlaggedSection`, `TopTasksSection`, `RecentFailuresSection`, `DuplicateTasksSection`) wrapped in a `<section>` with a heading and an empty state.

Each item is a clickable row that navigates to:
- Next-actions → `/sessions?selected={sessionId}`
- Critic flag → `/projects/{projectId}/specs?file={ref}` or `/plans?file={ref}` based on `kind`
- Top tasks → `/projects/{projectId}/{status === 'idea' ? 'ideas' : status === 'spec' ? 'specs' : 'plans'}` (the existing pipeline page corresponding to the task's status)
- Recent failures → `/sessions?selected={sessionId}`
- Duplicates → `/projects/{projectId}/ideas` (no per-task drilldown yet; defer to slice 3)

Token classes copy verbatim from the existing `app/(dashboard)/insights/page.tsx` pattern (header, empty-state card, list rows).

Sidebar entry: the existing Sidebar is project-scoped (every NavItem hrefs into `/projects/${projectId}/...`). Briefing is cross-project, so we add a new "Global" section at the top of `components/layout/Sidebar.tsx` (above the project-scoped section that contains Dashboard / Docs / Inbox / Tasks) with a single NavItem: **Briefing → `/briefing`**. Use lucide icon `LayoutDashboard`. The active state is `pathname === '/briefing'`.

### Refresh

`useBriefing` SWR hook with `refreshInterval: 60_000` and `revalidateOnFocus: true`. Disable when document hidden.

### Empty states

Each section renders a short friendly empty-state when its array is empty:
- "No open next steps in the last 14 days."
- "No critical critic findings."
- "No tasks waiting for work."
- "No graded failures in the last 7 days."
- "No likely duplicate tasks detected."

If all five are empty, the page renders a single welcoming message: "All clear. Nothing flagged."

## Migrations

None. All required tables and columns exist (`sessions.next_actions`, `sessions.grade*`, `critic_findings`, `tasks`, `embeddings`).

## Tests

Per-aggregator unit tests (in-memory DB, seeded fixtures):
- Each aggregator: empty-state, single-row, ordering, cap, filter (by date, severity, status, similarity)

API test (`app/api/briefing/__tests__/briefing.test.ts`):
- Returns shape with all 5 keys + generatedAt
- Empty DB returns all-empty arrays + generatedAt
- One aggregator throwing does not block others (mock one to throw, assert others still populated, generatedAt still present)

Component test:
- Empty state renders for each section
- Section with items renders the right link target per item
- Loading state and error state

Target: ~30 new tests on top of 1105 = ~1135 total.

## Risks

- **Duplicate aggregator cost**: Cosine compute over up to 100 task embeddings per project per request is O(n²) per project. With many projects this could be slow. Mitigation: SWR-cached by client (60s); the API is GET so multiple tabs share one cache via SWR's request dedup. If profiling reveals a hotspot, add a `briefing_duplicates` cache table later.
- **`graded_at` lookup**: Sessions only get a `grade` after the background `grade_session` job runs — fresh ungraded sessions don't appear in Recent Failures even if they obviously failed. Acceptable: the briefing reflects the reflective workflow's view, not the raw status field.
- **Dead-link risk**: If a critic finding's `ref` no longer exists on disk, clicking the link 404s. Acceptable v1 — slice 1 already exhibits the same pattern with prep notes referencing files that may move.

## Open questions

(Self-resolved.)

- *Should briefing be the new root page (`/`)?* No. Existing root redirects to project ideas; users have muscle memory. `/briefing` is opt-in.
- *Should it support project filtering?* No for v1. Cross-project view is more useful as a "morning briefing". Per-project filtering is a slice 3 (Tasks page) concern.
- *Should we surface external task signal here?* No — would require live adapter calls every refresh and would break the static-data SWR pattern. Slice 3 owns external task surfacing.
