# Multi-Source External Task Integration with Resource Picker

**Date:** 2026-04-07
**Status:** Approved

## Problem

The current system allows only one external task source per project (`project_id` is the primary key of `task_source_config`). There is no way to configure a second source once the first is saved. Additionally, when selecting resources to sync (boards, repos, projects), users must type IDs manually — there is no discovery UI.

## Goals

- All supported adapters (Jira, GitHub, monday.com, DoneDone) are independently configurable per project
- Each adapter shows its credential fields and a resource picker inline in settings
- Resource picker fetches available options from the external service on credential field blur
- Users select resources via toggleable name badges (no checkboxes)

## Database

`task_source_config` schema change:

- Add `id` INTEGER PRIMARY KEY (autoincrement)
- Change unique constraint from `(project_id)` to `(project_id, adapter_key)` — one config row per adapter per project
- Add `resource_ids` TEXT (JSON array of selected resource IDs) — replaces per-adapter text fields (`board_ids`, `repos`, `jql_filter`)

## Adapter Interface

Two additions to `TaskSourceAdapter` in `lib/taskSources/adapters/types.ts`:

```ts
resourceSelectionLabel: string
// e.g. "Select boards", "Select repositories", "Select projects"

fetchAvailableResources(
  config: Record<string, string>
): Promise<{ id: string; name: string }[]>
```

- Remove `board_ids` from monday.com `configFields`
- Remove `repos` from GitHub `configFields`
- Remove `jql_filter` from Jira `configFields`
- Each adapter's `fetchTasks` reads selected IDs from `config.resource_ids` (parsed JSON array)

## API

| Route | Method | Change |
|---|---|---|
| `/api/projects/[id]/task-source` | GET | Returns array of configs (one per adapter key) |
| `/api/projects/[id]/task-source` | PUT | Accepts `{ adapterKey, config }` — upserts by `(project_id, adapter_key)` |
| `/api/projects/[id]/task-source` | DELETE | Accepts `{ adapterKey }` query param |
| `/api/projects/[id]/task-source` | PATCH | Accepts `{ adapterKey, isActive }` |
| `/api/projects/[id]/task-source/resources` | POST | New — `{ adapterKey, config }` → `{ resources: { id, name }[] }` |
| `/api/projects/[id]/sync-tasks` | POST | Accepts optional `{ adapterKey }` — syncs all if omitted |

## Settings UI

`TaskSourceSettings` renders one card per adapter, always visible.

**Unconfigured card:** collapsed — service name + "Set up" button to expand form.

**Configured / editing card:** expanded —
1. Credential fields (pre-filled, passwords redacted)
2. Resource picker section:
   - Header: adapter's `resourceSelectionLabel`
   - Toggleable name badges (click to select/deselect)
   - Fetched on blur of any credential field; shows loading state while fetching; shows error inline if fetch fails
3. Save / Pause / Remove buttons

Selected badges are submitted as `resource_ids` array alongside credentials on save.

## Sync Behaviour

- `startAllPolling` starts a polling interval per `(project_id, adapter_key)` row
- Each sync run is independent; failure of one adapter does not affect others
- `last_error` and `last_synced_at` tracked per row

## Out of Scope

- Ordering/prioritising tasks across multiple sources
- Per-source sync intervals
- Migrating data from the old single-source schema (a migration will handle the schema change; existing configs are preserved)
