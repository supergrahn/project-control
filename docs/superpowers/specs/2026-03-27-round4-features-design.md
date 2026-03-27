# Round 4 Features — Design Spec

**Date:** 2026-03-27

---

## Feature 1: Weekly Review Generator

### Goal
Auto-generate a comprehensive weekly review from the last 7 days of events, debriefs, insights, and git activity. A "what happened this week" report for personal retrospective.

### How it works

**API:** `GET /api/weekly-review` — assembles data from the last 7 days.

Sections:
- **Summary stats:** sessions launched, debriefs generated, audits run, ideas created, features completed
- **Per-project highlights:** most active projects, key decisions made (from insights)
- **Pipeline movement:** features that advanced stages this week
- **Git summary:** total commits across all projects, branches active
- **Recommendations:** stale items, unfinished work, suggested focus for next week

**UI:** A "Weekly Review" button on the dashboard. Opens a modal with the full report, copy-to-clipboard.

### Files
- `lib/weekly-review.ts` — `generateWeeklyReview(events, insights, dashboardData, gitActivity)`
- `app/api/weekly-review/route.ts`
- `components/WeeklyReviewModal.tsx`
- Modify: `app/(dashboard)/page.tsx` — add button

---

## Feature 2: Feature Dependencies

### Goal
Track which features block or depend on other features. Surface blocked items in Up Next and on the Kanban board.

### How it works

**Storage:** `feature_deps` SQLite table:
```sql
CREATE TABLE feature_deps (
  id TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL,
  depends_on_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

`feature_key` and `depends_on_key` match the stripped basenames from the dashboard's feature map.

**API:** `GET/POST/DELETE /api/feature-deps?projectId=`

**UI:** On the plans page, a "Dependencies" section in the FileDrawer showing what this feature depends on and what depends on it. A small "Blocked" badge on Up Next items that have unresolved dependencies.

### Files
- DB migration + CRUD in `lib/db.ts`
- `app/api/feature-deps/route.ts`
- `hooks/useFeatureDeps.ts`
- Modify: `components/FileDrawer.tsx` — show deps section
- Modify: `lib/dashboard.ts` — check deps when building upNext

---

## Feature 3: Paste Bin (Universal Clipboard)

### Goal
A universal paste target where you can dump text from any source — NotebookLM audio transcripts, ChatGPT conversations, Slack messages, meeting notes. Tagged to projects, searchable, and injectable into sessions.

### How it works

**Storage:** Reuses the `bookmarks` table (already built) but with a simplified "paste" interface.

**UI:** `Cmd+V` when focused on the dashboard (not in an input) opens a "Quick Paste" modal pre-filled with clipboard content. User adds a title and tags, saves. Alternatively, a `/paste` API endpoint that accepts raw text for integration with external tools.

**External integration:** `POST /api/paste` accepts `{ title, content, projectId?, tags? }` — can be called from browser bookmarklets, Raycast extensions, or shell scripts:
```bash
echo "my notes" | curl -X POST http://localhost:3001/api/paste -H 'Content-Type: application/json' -d @-
```

### Files
- `app/api/paste/route.ts` — simplified POST endpoint
- `components/PasteModal.tsx` — `Cmd+V` capture modal
- Modify: `app/(dashboard)/layout.tsx` — `Cmd+V` handler

---

## Feature 4: Session Usage Tracker

### Goal
Track how many sessions you run, how long they last, and aggregate stats per project. Understand where your time and Claude usage goes.

### How it works

**Data source:** The existing `sessions` table has `created_at` and `ended_at`. Calculate duration from these.

**API:** `GET /api/usage?period=week|month` — aggregates session stats.

```typescript
type UsageReport = {
  period: string
  totalSessions: number
  totalDuration: number // minutes
  byProject: Array<{ projectName: string; sessions: number; duration: number }>
  byPhase: Array<{ phase: string; sessions: number; duration: number }>
  dailyBreakdown: Array<{ date: string; sessions: number; duration: number }>
}
```

**UI:** A `/usage` page with:
- Total sessions + duration this week/month
- Bar chart of sessions per project (simple CSS bars, no chart library)
- Daily breakdown table

### Files
- `lib/usage.ts` — `calculateUsage(sessions, period)`
- `app/api/usage/route.ts`
- `hooks/useUsage.ts`
- `app/(dashboard)/usage/page.tsx`

---

## Feature 5: Smart Notifications Bar

### Goal
A notification bell in the TopNav that shows unread events requiring attention — audit blockers, stale features, gate requests from orchestrators.

### How it works

**Data source:** The existing `events` table + a new `notifications_read` table tracking which events the user has seen.

```sql
CREATE TABLE notifications_read (
  event_id TEXT PRIMARY KEY,
  read_at TEXT NOT NULL
)
```

**API:** `GET /api/notifications` — returns unread events. `POST /api/notifications/read` — marks events as read.

**UI:** A bell icon in TopNav showing unread count badge. Clicking opens a dropdown with the last 10 unread events. Each event has a "dismiss" button.

### Files
- DB migration + functions in `lib/db.ts`
- `app/api/notifications/route.ts`
- `hooks/useNotifications.ts`
- Modify: `components/nav/TopNav.tsx` — bell icon + dropdown

---

## Build Order

1. Session Usage Tracker (independent, high visibility)
2. Weekly Review Generator (uses events + insights)
3. Paste Bin (simple, extends bookmarks)
4. Feature Dependencies (modifies dashboard engine)
5. Smart Notifications Bar (modifies TopNav)
