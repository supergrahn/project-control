# Round 3 Features — Design Spec

**Date:** 2026-03-27

---

## Feature 1: Focus Mode

### Goal
Filter the entire dashboard to 1-3 "focus projects" for deep work. Everything else fades away — Up Next, suggestions, sessions, all scoped to focus set.

### How it works

**Storage:** `focus_projects` in localStorage — array of project IDs.

**UI:** A "Focus" toggle button in TopNav. Clicking it opens a small dropdown where you check 1-3 projects. When active, a purple bar appears under the nav: "Focused on: project-control, aetherspectra". All dashboard queries filter by these IDs.

**Integration:** `useDashboard`, `useSuggestions`, `useGitActivity` all accept an optional `focusProjectIds` parameter. The focus state is provided via a React context.

### Files
- `hooks/useFocus.ts` — focus state context + localStorage persistence
- Modify: `app/(dashboard)/layout.tsx` — FocusProvider + focus bar
- Modify: `components/nav/TopNav.tsx` — Focus toggle button
- Modify: `app/(dashboard)/page.tsx` — pass focus filter to dashboard

---

## Feature 2: Bookmarks & Research Clips

### Goal
Save snippets from the web, NotebookLM exports, articles, or any text — tagged to projects. Like a research clipboard that feeds into context packs or session prompts.

### How it works

**Storage:** `bookmarks` SQLite table:
```sql
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  tags TEXT,
  created_at TEXT NOT NULL
)
```

**API:** `GET/POST/DELETE /api/bookmarks?projectId=`

**UI:** A `/bookmarks` page with:
- "Add Bookmark" form (title, URL, content, tags)
- Filterable list by project and tags
- "Inject into Session" button that copies content into the active session's context

**Integration with context packs:** A "Convert to Context Pack" button on each bookmark that creates a context pack from the bookmark content.

### Files
- DB migration + CRUD in `lib/db.ts`
- `app/api/bookmarks/route.ts`
- `hooks/useBookmarks.ts`
- `app/(dashboard)/bookmarks/page.tsx`

---

## Feature 3: Progress Timeline

### Goal
Visualize how features move through the pipeline over time. A timeline view showing when ideas became specs, specs became plans, plans were developed.

### How it works

**Data source:** The existing `events` table already logs session starts, audit completions, etc. Parse events to reconstruct feature lifecycle.

**API:** `GET /api/timeline?projectId=` — returns events grouped by feature, sorted chronologically.

**UI:** A `/timeline` page with a horizontal timeline per feature showing dots at each stage transition. Color-coded by stage.

```
auth-system:  ●───●───●───◉
              idea  spec  plan  dev
              Mar 20  Mar 22  Mar 25  Mar 27
```

### Files
- `lib/timeline.ts` — `buildTimeline(events, features)`
- `app/api/timeline/route.ts`
- `hooks/useTimeline.ts`
- `app/(dashboard)/timeline/page.tsx`

---

## Feature 4: Git Diff Viewer

### Goal
See uncommitted changes in any project without leaving the dashboard. A read-only diff view accessible from the Git Activity page.

### How it works

**API:** `GET /api/git-diff?projectId=` — runs `git diff` and `git diff --cached`, returns unified diff output.

**UI:** Clicking a project with uncommitted changes on the Git Activity page opens a drawer showing the full diff with syntax-highlighted additions/deletions.

### Files
- `lib/git-activity.ts` — add `getGitDiff(projectPath)`
- `app/api/git-diff/route.ts`
- `components/DiffDrawer.tsx` — read-only diff display with green/red highlighting

---

## Feature 5: Project Templates

### Goal
Save a project's directory structure + config as a template. Create new projects from templates with one click.

### How it works

**Storage:** `templates` SQLite table:
```sql
CREATE TABLE templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dirs TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`dirs` is JSON: `{ ideas_dir: "docs/ideas", specs_dir: "docs/specs", plans_dir: "docs/plans" }`

**UI:** In Settings, a "Save as Template" button on any project. When adding a new project, "Create from Template" option pre-fills the dir config.

### Files
- DB migration + CRUD in `lib/db.ts`
- `app/api/templates/route.ts`
- `hooks/useTemplates.ts`
- Modify: settings page or project creation flow

---

## Build Order

1. Focus Mode (foundation — affects all other features)
2. Bookmarks & Research Clips (independent, high daily value)
3. Git Diff Viewer (extends existing git activity)
4. Progress Timeline (uses existing events)
5. Project Templates (independent, low priority)
