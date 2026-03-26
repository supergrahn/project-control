# Development Command Centre Design

**Date:** 2026-03-27

---

## Goal

Replace the blank root `/` page with a development command centre that aggregates data across all registered projects. The dashboard answers three questions: "what's happening now?", "what should I work on next?", and "where is everything?".

## Background

The app currently has per-project pages (Ideas, Specs, Plans, Developing, Memory) but no cross-project overview. With ~15 projects registered, developers must click through tabs to understand the state of their work. The command centre provides a single view that drives development forward through the Ideas → Specs → Plans → Developing pipeline.

---

## Architecture

### New files

```
lib/
  dashboard.ts              ← readiness engine, feature map builder, stage inference
app/
  api/
    dashboard/
      route.ts              ← GET — aggregation endpoint, returns all widget data
  (dashboard)/
    page.tsx                 ← the dashboard page (root /)
hooks/
  useDashboard.ts           ← single useDashboard() hook
tests/
  lib/
    dashboard.test.ts       ← readiness engine unit tests
```

### Data sources (all existing)

- `listProjects()` from `lib/db.ts` — all registered projects
- File system scan of each project's `ideas_dir`, `specs_dir`, `plans_dir`
- `getActiveSessions()` from `lib/db.ts` — active sessions (returns sessions with `status: 'active'`)
- Audit files in `{plans_dir}/audits/` — audit status per plan

No new database tables or columns.

---

## Readiness Engine (`lib/dashboard.ts`)

### Feature map

For each project, scan configured dirs and build a map keyed by basename (filename without `.md` and without date prefix):

```
"auth-system" → {
  idea: "/path/ideas/auth-system.md",
  spec: "/path/specs/2026-03-26-auth-system.md",
  plan: null,
  audit: null
}
```

**Date prefix stripping:** Filenames like `2026-03-26-auth-system.md` → basename `auth-system`. Regex: `/^\d{4}-\d{2}-\d{2}-/`. If after stripping the files still don't match across dirs, fall back to the full basename (without `.md`).

### Stage inference rules

| # | Condition | Stage | Destination |
|---|-----------|-------|-------------|
| 1 | Has plan + active session | — | `inProgress` (not upNext) |
| 2 | Has plan + audit clean 🟢 + no active session | `develop` | upNext |
| 3 | Has plan + audit with issues (🟡/🔴) | `develop` | upNext (badge shows audit status) |
| 4 | Has plan + no audit | `develop` | upNext (unaudited) |
| 5 | Has spec + no plan | `plan` | upNext |
| 6 | Has idea + no spec | `spec` | upNext |

### Frontmatter status override

Files may include `status` in their YAML frontmatter:

- `status: done` — treated as complete, excluded from Up Next
- `status: skip` — excluded entirely from all widgets
- `status: ready` — forced into Up Next even if auto-inference says otherwise
- `status: in-progress` — shown with "in progress" label but no active session required

When present, frontmatter `status` overrides auto-inference.

### Stale detection

If the most recent file in a feature's chain (the furthest-stage file) hasn't been modified in 7+ days and there's no `status` override, mark `stale: true`. Stale items sink to the bottom of Up Next and show a `⏸ stale` indicator.

### Type definitions

```typescript
type Stage = 'develop' | 'plan' | 'spec'

type AuditLabel = 'clean' | 'warnings' | 'blockers'

type FeatureEntry = {
  key: string                    // basename after date stripping
  originalBasenames: {           // original filenames (before stripping) for audit key lookup
    idea?: string
    spec?: string
    plan?: string
  }
  idea: string | null            // file path
  spec: string | null
  plan: string | null
  audit: { blockers: number; warnings: number } | null
  latestModified: Date           // mtime of furthest-stage file
  frontmatterStatus: string | null  // from YAML frontmatter `status` field
}
```

**Audit status label mapping:** `blockers > 0` → `'blockers'`, `blockers === 0 && warnings > 0` → `'warnings'`, `blockers === 0 && warnings === 0` → `'clean'`, no audit file → `null`.

**Audit key lookup:** The existing audit system keys by the plan's original basename (with date prefix, without `.md`). When looking up audit status for a feature, use `entry.originalBasenames.plan` (not the date-stripped `entry.key`). For example, plan file `2026-03-26-auth-system.md` has audit key `2026-03-26-auth-system`, even though the feature map key is `auth-system`.

### Exported functions

```typescript
stripDatePrefix(filename: string): string
buildFeatureMap(projectPath: string, dirs: { ideas_dir?, specs_dir?, plans_dir? }): Map<string, FeatureEntry>
  // Also reads {plans_dir}/audits/ to populate FeatureEntry.audit
inferStage(entry: FeatureEntry, hasActiveSession: boolean): Stage | 'inProgress' | null
applyOverrides(entry: FeatureEntry, stage: Stage | null): Stage | null
detectStale(entry: FeatureEntry, now: Date): boolean
buildDashboardData(projects: Project[]): DashboardResponse
```

All functions are pure except `buildFeatureMap` (reads filesystem + audits dir) and `buildDashboardData` (orchestrator).

---

## API — `GET /api/dashboard`

Single endpoint, no query params. Returns all widget data aggregated across all projects.

### Response shape

```typescript
type DashboardResponse = {
  inProgress: Array<{
    projectId: string
    projectName: string
    sessionId: string       // used to open SessionModal for resuming
    phase: string
    sourceFile: string
    featureName: string
    createdAt: string       // maps from session.created_at
  }>

  upNext: Array<{
    projectId: string
    projectName: string
    featureName: string
    filePath: string
    stage: 'develop' | 'plan' | 'spec'
    auditStatus: 'clean' | 'warnings' | 'blockers' | null
    stale: boolean
    status: string | null
  }>

  pipeline: {
    ideas: number
    specs: number
    plans: number
    active: number
  }

  health: {
    blockers: number
    warnings: number
    clean: number
    unaudited: number
    worst: Array<{ projectName: string; planName: string; blockers: number; warnings: number }>
  }

  recentlyTouched: Array<{
    projectId: string
    projectName: string
    featureName: string
    dir: 'ideas' | 'specs' | 'plans'
    modifiedAt: string
  }>
}
```

### Matching logic

A spec file `auth-system.md` matches a plan file `auth-system.md` by basename (after date prefix stripping). Same matching used by the existing audit system.

### Sorting

Up Next sorted by: `develop` first, then `plan`, then `spec`. Within each group, most recently modified first. Stale items sink to the bottom of their group.

`recentlyTouched` sorted by `modifiedAt` desc, limited to 8 entries.

`health.worst` sorted by blockers desc then warnings desc, limited to 3 entries.

---

## Hook — `useDashboard.ts`

```typescript
useDashboard()
  // queryKey: ['dashboard']
  // queryFn: GET /api/dashboard
  // refetchInterval: 30000 (30s)
  // returns DashboardResponse
```

Single hook, single query. No mutations — the dashboard is read-only.

---

## UI Layout

### Page structure

```
┌──────────────────────────────────────────────────────┐
│ ● IN PROGRESS  project · feature · 4m    [Resume →]  │  ← conditional
├──────────────────────────────────────────────────────┤
│ UP NEXT — Ready to Continue                           │
│ ┌─────────────┬──────────┬────────┬─────────┐        │
│ │ FEATURE     │ PROJECT  │ STAGE  │         │        │  ← hero table
│ │ render-pipe │ aether   │ develop│ Start → │        │
│ │ colour-match│ ochroma  │ develop│ Start → │        │
│ │ export-fmt  │ motion   │ plan   │ Plan →  │        │
│ │ cache-layer │ ssd      │ spec   │ Spec →  │        │
│ └─────────────┴──────────┴────────┴─────────┘        │
├─────────────────────────┬────────────────────────────┤
│ Pipeline: 24 ideas      │ Health: 3 🔴  5 🟡  8 🟢   │  ← bottom strip
│  11 specs  8 plans      │ Worst: project-ctrl · 2 🔴  │
└─────────────────────────┴────────────────────────────┘
```

### Components

**`InProgressBanner`**
- Conditional — hidden when no active sessions
- Purple background (`bg-violet-500/10 border-violet-500/30`)
- Shows: purple dot, project name, feature name (from source_file basename), session duration (computed from `createdAt`)
- "Resume →" button: calls `openProject(project)` then navigates to `/developing`
- Multiple active sessions: stacks vertically, one row per session

**`UpNextTable`**
- Full-width table, the hero widget
- Columns: Feature name, Project name, Stage badge, Action button
- Stage badges colour-coded: `develop` = green (`bg-green-500/20 text-green-300`), `plan` = purple (`bg-violet-500/20 text-violet-300`), `spec` = blue (`bg-blue-500/20 text-blue-300`)
- Stale items: subtle `⏸ stale` label in zinc, row text slightly dimmed
- Audit status shown as small badge next to stage for develop items (🔴/🟡/🟢)
- Action button: "Start →" for develop (opens PromptModal), "Plan →" / "Spec →" for others (opens project tab + navigates to page)
- Empty state: "All caught up — no actionable features across your projects"

**`BottomStrip`**
- Two halves, full-width
- Left: pipeline counts as inline text (e.g., "24 ideas · 11 specs · 8 plans")
- Right: health summary counts + worst offender (project name + blocker count)
- Clicking health numbers navigates to the relevant project's /plans page

### Navigation mechanism

The dashboard page uses `useRouter()` from `next/navigation` for programmatic navigation, combined with the existing `openProject()` from `useProjectStore()`.

To resolve project objects from IDs (needed by `openProject()`), the dashboard page also calls `useProjects()` and builds a lookup map: `const projectMap = Object.fromEntries(projects.map(p => [p.id, p]))`.

### Interactions

- **Any Up Next row click:** calls `openProject(projectMap[projectId])`, then `router.push('/plans')` (or `/specs`/`/ideas` depending on stage)
- **"Start →" on develop-ready:** calls `openProject(...)`, then opens PromptModal to launch a develop session
- **"Resume →" on In Progress:** calls `openProject(...)`, then `router.push('/developing')`. The `sessionId` is available to open a SessionModal if needed.
- **Pipeline/health clicks:** navigate to the relevant project or page

### No project selector

This page always shows data across all projects. The existing Chrome-style project tabs remain for per-project views (Ideas, Specs, Plans, Developing, Memory).

---

## Edge Cases

- **Project with no configured dirs** → excluded from all widgets, no error
- **Project with dirs configured but empty** → contributes 0 to pipeline, nothing in Up Next
- **Feature with only an idea + `status: ready`** → appears in Up Next at stage `spec`
- **Multiple active sessions** → In Progress banner stacks (one row per session)
- **No active sessions** → banner hidden, Up Next moves to top
- **No actionable items** → "All caught up" empty state
- **Audit file with malformed frontmatter** → treated as unaudited
- **Feature basename collision across projects** → no issue, feature map is per-project

## Performance

- `/api/dashboard` scans all project dirs on every call. With ~15 projects, this completes in <50ms. No caching needed.
- `useDashboard()` uses `refetchInterval: 30000` (30s) to keep sessions fresh.

## Testing (`tests/lib/dashboard.test.ts`)

- `stripDatePrefix()` — with and without date prefix, edge cases (no match, partial match)
- `buildFeatureMap()` — maps files across dirs by basename, handles date prefix stripping, ignores non-.md files
- `inferStage()` — all 6 inference rules
- `applyOverrides()` — each frontmatter status value overrides correctly
- `detectStale()` — marks features untouched >7 days, respects status override

---

## Build Order

1. `lib/dashboard.ts` — `stripDatePrefix`, `buildFeatureMap`, `inferStage`, `applyOverrides`, `detectStale`, `buildDashboardData`
2. `tests/lib/dashboard.test.ts` — unit tests for all pure functions
3. `app/api/dashboard/route.ts` — GET handler calling `buildDashboardData`
4. `hooks/useDashboard.ts` — single hook
5. `app/(dashboard)/page.tsx` — InProgressBanner, UpNextTable, BottomStrip
6. Wire up navigation: openProject + router.push on row clicks and action buttons
