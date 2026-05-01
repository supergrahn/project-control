# Task Prep Slice — Manual Smoke Checklist

**Date:** 2026-05-01
**Branch:** `feature/task-prep`
**Purpose:** End-to-end verification that the Task Prep slice (Tasks 1–12) works in a live browser before merging back to `main`.

This is a DRY narrative: the sandbox can't actually click in a browser, so this checklist documents exactly what a human (or future-you) should walk through to validate the slice in a real environment.

## Prerequisites

- A local dev DB with at least one project that has an external task source configured (Jira, Monday, or DoneDone) and a few synced external tasks.
- A working local LLM provider (the prep pipeline calls a provider to generate the markdown body / structured payload).
- `npm run dev` server running.

## Steps

### 1. Start dev server

```bash
cd /home/tomespen/git/project-control/.worktrees/task-prep
npm run dev
```

Wait for `Ready in …`.

### 2. Inbox: prep-bot comments render

1. Open `http://localhost:3000/projects/<some-project-id>/inbox`.
2. **Expected:** any rows authored by `prep-bot` render with:
   - A violet pill labelled `🔮 Prepped`.
   - The body rendered as markdown (headings, bullets, fenced code, links — not raw text).
3. If no prep-bot rows exist yet, skip to step 8 (auto-fire path) first to generate one, then come back.

### 3. External task drawer: Prep panel slot

1. Click any external task row (Jira issue, Monday item, or DoneDone ticket) to open `ExternalTaskDetailDrawer`.
2. **Expected:** between the **Description** section and the **Metadata** section there is a new **Prep** panel.
3. Panel should not push other content off-screen — it expands inline.

### 4. Unprepped task: prepare flow

1. Pick a task that has never been prepped (Prep panel says "Not yet prepped").
2. Click **Prepare now**.
3. **Expected:**
   - Network tab shows `POST /api/tasks/<id>/prepare` returning `202 Accepted`.
   - Panel immediately flips to **"Prepping…"** state (spinner / muted text) on the next refresh of the drawer's prep query.

### 5. Wait for completion

1. Wait roughly 10–30 seconds (depends on local provider speed).
2. Refresh the drawer (close + reopen, or trigger the prep panel's own refetch).
3. **Expected:** panel now shows the **ready** state with:
   - Summary text.
   - Detected intent (e.g. `bugfix`, `feature`, `refactor`).
   - File list — each file should be clickable to copy its path.
   - Open questions section (may be empty if the model produced none).

### 6. Re-prep flow

1. Click **Re-prep** on a ready panel.
2. **Expected:**
   - `POST /api/tasks/<id>/prepare` fires again, returns `202`.
   - Panel flips back to **"Prepping…"**.
   - After another ~10–30s, panel returns to ready state with potentially updated content.

### 7. Failure path + retry

1. Temporarily break the local provider — either disable it from `/settings/providers` or edit the provider URL in `providers` config to something that won't resolve.
2. Re-prep a task.
3. **Expected:**
   - Panel transitions to **failed** state.
   - A **Retry** button appears.
   - Error reason is visible (or at least "Prep failed").
4. Restore the provider, click **Retry**, confirm panel recovers to ready.

### 8. Auto-fire on sync

1. Pick a task on the external source (e.g. in Jira) and edit its title or description.
2. In the Project Control UI, sync that project (whatever button triggers `syncService.syncProject`).
3. **Expected:**
   - After sync completes, a new `prep-bot` comment row appears in the inbox for that task.
   - Opening the drawer shows the Prep panel in ready state with the freshly generated content.
4. This proves the auto-fire wiring (Task 9 / 10) works end-to-end without any manual button click.

## Exit criteria

All eight steps pass with no console errors and no 500s in the network tab. If any step fails, file an issue tagged `task-prep` and do not merge.

## Cross-reference: gate results from this run

- **Vitest:** `npx vitest run` — 121 files / 930 tests passed.
- **Build:** `npm run build` — `✓ Compiled successfully`.
- **Browser smoke:** *not executed in this sandbox* — must be walked through by a human before merge.
