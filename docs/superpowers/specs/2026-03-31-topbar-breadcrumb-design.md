# TopBar Breadcrumb & Project Settings Drawer

**Goal:** Add a slim top bar to every project page showing a breadcrumb (`project-name › current-page`) and a settings gear that opens a right-side drawer for configuring project directory paths.

---

## Architecture

One new component (`components/layout/TopBar.tsx`) rendered inside `app/(dashboard)/layout.tsx`. The component is self-contained: it reads routing state, owns the drawer open/closed state, and calls the existing `useUpdateSettings` mutation. No new API routes or hooks are needed.

### Layout change

`app/(dashboard)/layout.tsx` currently renders:

```
<div>          ← right column (flex column)
  <main>       ← page content
```

After this change:

```
<div>                ← right column (flex column)
  <TopBar />         ← 38px bar, only when selectedProject exists
  <div>              ← horizontal flex row (overflow hidden, flex 1)
    <main>           ← page content (unchanged)
    <AssistantPanel> ← unchanged
```

`<TopBarWrapper />` is inserted between the optional `<ClaudeNotFound>` banner and the existing horizontal flex `<div>` that wraps `<main>` and `<AssistantPanel>`. It does not wrap or replace any existing element.

A `TopBarWrapper` function (same pattern as existing `SidebarWrapper`) reads `selectedProject` from `useProjectStore` and renders nothing when no project is active. Exact guard:

```typescript
if (!projectId || !selectedProject || selectedProject.id !== projectId) return null
```

This handles direct URL navigation before the store hydrates from localStorage.

---

## TopBar Component

**File:** `components/layout/TopBar.tsx`

**Props:** `{ projectId: string; projectName: string }`

### Visual spec

- Height: 38px
- Background: `#0c0e10` (matches sidebar)
- Border bottom: `1px solid #1c1f22`
- Padding: `0 16px`
- Full width of the content column (not the sidebar)

### Breadcrumb (left)

`{projectName}  ›  {currentPage}`

- **Project name**: muted (`#5a6370`), font-size 12, links to `/projects/{projectId}` — clicking navigates to the dashboard
- **Separator `›`**: `#2e3338`, font-size 12, `margin: 0 6px`, non-interactive
- **Current page**: bright (`#c8ced6`), font-size 12, font-weight 500, non-interactive

**Page name mapping** (derived from `usePathname()`, last meaningful segment):

| Pathname segment | Label |
|---|---|
| `` (root `/projects/[id]`) | Dashboard |
| `ideas` | Ideas |
| `specs` | Specs |
| `plans` | Plans |
| `developing` | Developing |
| `done` | Done |
| `reports` | Reports |
| `settings` | Settings |
| anything else | Capitalize first letter of segment |

### Settings gear (right)

- Icon: `⚙` character or an SVG cog, 14px, color `#5a6370`
- Hover: color `#8a9199`
- Button: no border, no background, cursor pointer, padding `6px 4px`
- Clicking sets `drawerOpen = true`

---

## Settings Drawer

Standard drawer pattern used elsewhere in the project: a fixed overlay div + a fixed `<aside>` sliding in from the right. All styling uses **inline styles** (not Tailwind), consistent with the other components added in this project.

**Width:** 420px  
**Background:** `#141618`  
**Border left:** `1px solid #1e2124`  
**Z-index:** 200

### Header

- Title: "Project Settings", `#e2e6ea`, 14px, font-weight 700
- X close button top-right, closes drawer
- Overlay click closes drawer

### Form fields

Three directory path fields. Each is a `<label>` + `<input>` pair.

| Field | Label | Placeholder |
|---|---|---|
| `ideas_dir` | Ideas directory | `docs/superpowers/ideas` |
| `specs_dir` | Specs directory | `docs/superpowers/specs` |
| `plans_dir` | Plans directory | `docs/superpowers/plans` |

- Input style: dark bg `#0d0e10`, border `#1e2124`, color `#e2e6ea`, font-size 13, full width
- Values pre-populated from the current project data (fetched via `useProjects()` filtered by `projectId`)
- Empty string is treated as `null` on save (clears the field back to default)

### Save button

- Before calling the mutation, each field value is mapped: `value.trim() === '' ? null : value.trim()`
- Calls `useUpdateSettings({ id: projectId, settings: { ideas_dir, specs_dir, plans_dir } })`
- While pending: label "Saving…", button disabled
- On success: drawer closes, react-query cache invalidated (handled by the mutation's `onSuccess`)
- On error: show inline error text below the button in `#c04040`

### Read-only fields (informational, not editable)

Below the save button, a divider section shows non-editable context:

| Field | Label |
|---|---|
| `name` | Project name |
| `path` | Root path |

These are shown as muted label/value pairs for reference, with a note: "To rename or move a project, update it directly in the database."

---

## File Map

| Action | File |
|---|---|
| Create | `components/layout/TopBar.tsx` |
| Modify | `app/(dashboard)/layout.tsx` — insert `<TopBarWrapper />` between the `<ClaudeNotFound>` banner and the horizontal flex div containing `<main>` + `<AssistantPanel>` |

---

## Testing

**`components/__tests__/TopBar.test.tsx`**

```typescript
// Mock usePathname, useProjectStore, useProjects, useUpdateSettings
```

Tests:
1. Renders project name in breadcrumb
2. Renders correct page label for known pathnames (ideas → "Ideas", root → "Dashboard")
3. Renders gear button
4. Clicking gear opens the drawer (settings panel becomes visible)
5. Renders ideas_dir / specs_dir / plans_dir fields pre-populated from project data
6. Clicking overlay closes drawer
7. Save button calls useUpdateSettings with correct payload
8. Shows "Saving…" while mutation is pending
