# Round 5 Features — Design Spec

**Date:** 2026-03-27

---

## Feature 1: Web Clipper API

### Goal
A REST endpoint that any browser extension, Raycast plugin, or bookmarklet can call to save web page content directly to the dashboard. The bridge between web research and project context.

### How it works

**API:** `POST /api/clip` — accepts:
```json
{
  "url": "https://...",
  "title": "Page Title",
  "content": "Extracted text or selection",
  "projectId": "optional — saved to global if omitted",
  "tags": "optional — comma-separated"
}
```

Saves to the `bookmarks` table (already exists). Returns the bookmark ID.

**Bookmarklet:** Generate a JavaScript bookmarklet URL on the bookmarks page that users can drag to their browser bar. When clicked, it sends the current page's selected text (or full page text) to the clip endpoint.

```javascript
javascript:void(fetch('http://localhost:3001/api/clip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href,title:document.title,content:window.getSelection().toString()||document.body.innerText.slice(0,5000)})}))
```

### Files
- `app/api/clip/route.ts` — POST endpoint (alias for bookmarks)
- Modify: `app/(dashboard)/bookmarks/page.tsx` — show bookmarklet code

---

## Feature 2: Daily Planning Mode

### Goal
A guided "start of day" flow that helps the user plan their day. Shows yesterday's standup, today's Up Next, and lets the user pick 3-5 items as "today's focus". These focus items get pinned to the dashboard.

### How it works

**UI:** A `/plan-day` page or modal triggered from the dashboard. Flow:
1. Shows yesterday's activity summary (from standup)
2. Shows Up Next items with checkboxes
3. User picks 3-5 items → saves as "daily plan"
4. Dashboard highlights these items for the day

**Storage:** `daily_plans` SQLite table:
```sql
CREATE TABLE daily_plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  items TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`items` is JSON array of `{ projectId, featureName, filePath, stage }`.

### Files
- DB migration + CRUD in `lib/db.ts`
- `app/api/daily-plan/route.ts` — GET today's plan, POST create
- `hooks/useDailyPlan.ts`
- `components/DailyPlanModal.tsx`
- Modify: `app/(dashboard)/page.tsx` — show today's plan items highlighted

---

## Feature 3: Project Comparison View

### Goal
Compare two projects side by side — pipeline state, health scores, recent activity, dependency versions. Useful for deciding which project needs attention.

### How it works

**UI:** A `/compare` page with two dropdowns to select projects. Shows them side by side:
- Pipeline counts (ideas/specs/plans)
- Health score
- Recent events
- Git status (branch, uncommitted changes)
- Shared dependency versions

### Files
- `app/(dashboard)/compare/page.tsx` — comparison view
- Uses existing hooks (useDashboard, useGitActivity, useTechAudit)

---

## Feature 4: Export to Markdown

### Goal
Export any dashboard view (standup, weekly review, audit report) to a downloadable markdown file. Also export the full project state as a structured report.

### How it works

**API:** `GET /api/export?type=standup|weekly|project-state&projectId=`

**Types:**
- `standup` — today's standup as .md
- `weekly` — weekly review as .md
- `project-state` — full project state (pipeline, health, recent events, git status) as .md

**UI:** Download button on standup modal, weekly review modal, and a new "Export" button on the dashboard.

### Files
- `app/api/export/route.ts`
- Modify: `components/StandupModal.tsx` — add download button
- Modify: `components/WeeklyReviewModal.tsx` — add download button

---

## Feature 5: Keyboard Shortcut Guide

### Goal
Show all available keyboard shortcuts in a help overlay. `?` key opens it.

### How it works

**Shortcuts tracked:**
- `Cmd+K` — Command palette
- `Cmd+I` — Quick capture
- `Cmd+Shift+V` — Quick paste
- `?` — Show shortcuts

**UI:** A simple modal listing all shortcuts with descriptions.

### Files
- `components/ShortcutGuide.tsx`
- Modify: `app/(dashboard)/layout.tsx` — `?` key handler

---

## Build Order

1. Web Clipper API (extends bookmarks, simple)
2. Keyboard Shortcut Guide (simple, independent)
3. Export to Markdown (extends existing modals)
4. Daily Planning Mode (new table + UI)
5. Project Comparison View (reuses existing data)
