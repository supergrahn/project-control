# Inbox: Per-Project External Task Comments Feed

**Date:** 2026-04-07
**Status:** Approved

## Problem

The sidebar already has an Inbox link but no page behind it. There is no way to see comments from external tasks (Jira, GitHub, Monday.com, DoneDone) in one place — users have to visit each external system individually.

## Goals

- Inbox page shows all comments from synced external tasks for the current project
- Comments are stored in the database and kept fresh by the existing 1-minute poll cycle
- Feed is filtered by source, sorted newest first

## Database

New `task_comments` table:

```sql
CREATE TABLE task_comments (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  source         TEXT NOT NULL,
  task_source_id TEXT NOT NULL,
  comment_id     TEXT NOT NULL,
  author         TEXT NOT NULL,
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  synced_at      TEXT NOT NULL,
  UNIQUE(source, task_source_id, comment_id)
)
CREATE INDEX idx_task_comments_project ON task_comments(project_id, created_at DESC)
```

- `task_source_id` matches `tasks.source_id` — no FK, avoids cascade complexity
- `UNIQUE(source, task_source_id, comment_id)` — upsert on conflict do nothing

## Adapter Interface

Add to `lib/taskSources/adapters/types.ts`:

```ts
export type ExternalComment = {
  id: string
  author: string
  body: string
  createdAt: string
}
```

Add optional field to `ExternalTask`:

```ts
comments?: ExternalComment[]
```

Each adapter fetches comments inline during `fetchTasks`:

| Adapter | Comment source |
|---|---|
| Jira | `GET /rest/api/3/issue/{id}/comment` |
| GitHub | `GET /repos/{owner}/{repo}/issues/{number}/comments` |
| Monday.com | GraphQL `updates { id text_body created_at creator { name } }` on each item |
| DoneDone | `GET /issues/{id}/comments.json` |

## Sync

`syncProjectSource` iterates `externalTasks` after the task upsert loop, collects all `comments` arrays, and bulk-inserts into `task_comments` using `INSERT OR IGNORE`.

## API

`GET /api/projects/[id]/inbox`

Returns comments joined with task title and source URL, newest first:

```ts
{
  comments: {
    id: string
    source: string
    author: string
    body: string
    created_at: string
    task_title: string
    task_source_id: string
    source_url: string | null
  }[]
}
```

SQL: join `task_comments` with `tasks` on `(project_id, source, source_id)`.

## Inbox Page

Route: `app/(dashboard)/inbox/page.tsx`

- Feed layout, full-width list, newest comment first
- Each row: source badge (colored per adapter), task title linked to `source_url`, author + relative timestamp, comment body (truncated ~3 lines with expand)
- Filter pills at top to show/hide by source
- Empty state: "No comments yet — comments will appear here as tasks sync"
- No pagination (per-project volumes are manageable)

## Out of Scope

- Unread/read tracking
- Replying to comments from within the app
- Cross-project inbox view
