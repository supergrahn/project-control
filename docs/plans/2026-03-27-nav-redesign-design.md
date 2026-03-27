# Nav Redesign + Project-Scoped Routing

**Date:** 2026-03-27
**Status:** Approved

## Problem

The top nav attempts to fit 18 items in a single horizontal bar, making it visually overwhelming and unusable. There is no clear primary workflow — all items are treated equally.

## Design

### Top bar (single row)

```
⬡ Project Control   Ideas  Specs  Plans  In Development  Reports   [Focus] [Bell] [Brain] [Settings] [☰]
```

- **Left**: App logo/brand
- **Center**: Primary workflow nav — the 5 stages of the development lifecycle
- **Right**: Utility icons (Focus, Bell, Brain/Assistant, Settings) + hamburger `[☰]` that opens the right drawer

### Project tabs (row 2, unchanged)

```
my-repo ×   other-repo ×   +
```

Tabs below the main bar for switching between open projects. Unchanged from current implementation.

### Right sidebar drawer (`[☰]`)

Slides in from the right. Contains all non-workflow navigation grouped into two sections:

**Project Health**
- Dashboard, Insights, Git, Usage, Compare, Tech Audit, Timeline, Kanban

**Tools**
- Memory, Context, Search, Bookmarks, Templates

## Routing

All workflow pages are project-scoped:

| Page | Route |
|------|-------|
| Ideas | `/projects/[repo]/ideas` |
| Specs | `/projects/[repo]/specs` |
| Plans | `/projects/[repo]/plans` |
| In Development | `/projects/[repo]/developing` |
| Reports | `/projects/[repo]/reports` |

Secondary pages (Insights, Git, etc.) also become project-scoped under `/projects/[repo]/[page]`.

**Root `/` behaviour:**
- Redirects to last active project (`/projects/[last-repo]/ideas` or similar)
- If no previous project, opens project selector modal automatically

## Workflow model

Sessions are not a standalone nav item — they are contextual to each stage:
- Ideas, Specs, and Plans each have their own Claude sessions
- **In Development** = sessions actively executing plans
- **Reports** = retrospective view across all session types, showing git commits, features shipped, bugs fixed, session summaries

## Document storage

Ideas, specs, and plans are stored in project-control's data store by default, scoped to each project. Each document exposes an **"Export to repo"** action that writes the file to:

```
~/src/[repo]/docs/ideas/
~/src/[repo]/docs/specs/
~/src/[repo]/docs/plans/
```
