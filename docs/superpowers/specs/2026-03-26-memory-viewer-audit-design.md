# Memory Viewer + LLM Audit Design

**Date:** 2026-03-26

---

## Goal

Give developers visibility into and control over Claude Code's auto-memory system, then leverage that memory in a structured LLM audit of plans.

## Background

Claude Code persists project-specific memories at `~/.claude/projects/{encoded-path}/memory/`. These files directly influence every Claude session — stale or wrong memories produce bad plans. This dashboard is the ideal place to surface and manage them.

---

## Part 1 — Memory Viewer & Editor

### New route: `/memory`

A new top-level dashboard page alongside Ideas/Specs/Plans/Developing.

### Memory path encoding

Claude Code encodes the absolute project path by replacing every `/` with `-`:
```
/home/user/git/my-project  →  -home-user-git-my-project
```

Since hyphens in project names are also preserved (only `/` is replaced), paths containing hyphens like `/home/user/my-project` encode to `-home-user-my-project`. Collision with `/home/user/myproject` → `-home-user-myproject` is theoretically possible but not a practical concern for typical git folder layouts.

**Resolution strategy in `lib/memory.ts`:**
1. Compute the expected path with the formula above
2. If the directory exists, use it
3. If not, scan all subdirectories of `~/.claude/projects/` and return the one whose name most closely matches (levenshtein distance or prefix match)
4. If no match, return `null` — caller treats as "no memories yet"

This ensures silent wrong-path reads never occur.

### Memory file structure

```
~/.claude/projects/{encoded}/memory/
  MEMORY.md          ← index (one-line entries per memory file)
  user_*.md          ← user profile, preferences
  feedback_*.md      ← corrections and validated approaches
  project_*.md       ← project state, goals, incidents
  reference_*.md     ← pointers to external resources
```

Each non-index file has YAML frontmatter:
```yaml
---
name: string
description: string
type: user | feedback | project | reference
---
```

### Data model

```typescript
type MemoryFile = {
  filename: string       // e.g. "feedback_testing.md"
  path: string           // absolute path
  name: string           // from frontmatter
  description: string    // from frontmatter
  type: 'user' | 'feedback' | 'project' | 'reference'
  content: string        // full file content including frontmatter
  modifiedAt: string
}
```

### API routes

**`GET /api/memory?projectId=`**
- Resolves project path → memory dir via `lib/memory.ts`
- Returns `MemoryFile[]` or `null` if no memory dir found
- Parses frontmatter for name/description/type; falls back to filename-derived values if frontmatter absent
- Sorted: `project` → `feedback` → `user` → `reference`, then by modifiedAt desc
- Excludes `MEMORY.md` index from results (shown separately)

**`PUT /api/memory?projectId=&filename=`**
- Body: `{ content: string }` — full file content (including frontmatter)
- **Path traversal guard:** resolved write path must start with the resolved memory directory path. If not, returns 400.
- `filename` must match `/^[\w-]+\.md$/` — no path separators, no dots in name
- Writes atomically: write to `{path}.tmp`, then `fs.renameSync` to final path
- Returns `{ ok: true }`

**`DELETE /api/memory?projectId=&filename=`**
- Same `filename` validation as PUT
- Deletes the file
- MEMORY.md cleanup: reads index, removes any line that contains `(${filename})` as a markdown link target (the format Claude Code uses: `- [Name](filename.md) — description`). If no such line exists, skips silently. Does not attempt to parse or reformat other content.
- Returns `{ ok: true }`

### Hooks (`hooks/useMemory.ts`)

```typescript
useMemory(projectId: string | null)
  // queryKey: ['memory', projectId]
  // returns MemoryFile[] | null

useUpdateMemory()
  // mutationFn: (vars: { projectId: string; filename: string; content: string }) => ...
  // onSuccess: invalidates ['memory', vars.projectId]

useDeleteMemory()
  // mutationFn: (vars: { projectId: string; filename: string }) => ...
  // onSuccess: invalidates ['memory', vars.projectId]
```

### UI components

**`app/(dashboard)/memory/page.tsx`**
- No-memory state: "No memories yet — Claude will create them as you run sessions"
- Groups files by type, type badge colour-coded: violet=project, amber=feedback, sky=user, zinc=reference
- Each card: name, description, type badge, last modified
- Click → opens `MemoryDrawer`

**`components/MemoryDrawer.tsx`**
- Props: `file: MemoryFile | null`, `projectId: string`, `onClose: () => void`
- Header: filename, type badge, close button
- Body: `<textarea>` — raw markdown including frontmatter, monospace, full height, auto-grows
- Footer: "Save" + "Delete" buttons
- Save: calls `PUT /api/memory`, shows "Saved ✓" for 2s, updates local content ref
- Delete: shows inline "Are you sure?" confirm before calling `DELETE /api/memory`, then closes drawer
- Unsaved-changes guard: if `content !== savedContent`, show browser `confirm()` before close

### Navigation

Add `{ label: 'Memory', href: '/memory' }` to `NAV_ITEMS` in `TopNav.tsx` between "Developing" and the settings icon.

---

## Part 2 — LLM Audit

### DB / phase types

`'audit'` is added to `Phase` in `lib/prompts.ts` only. Audit runs do **not** create a DB session record (no `createSession` call) — they are one-shot child processes, not interactive sessions. `SessionPhase` in `lib/db.ts` is unchanged.

### Trigger

- "Run Audit" action button on each plan card
- "Audit All Plans" button in the Plans page header

### Execution model

Audit uses `child_process.spawn('claude', ['--print', '--output-format', 'text'], { env })` — **not PTY**. (`--output-format text` is the default with `--print` but specified explicitly for clarity; `--no-stream` does not exist in the claude CLI.) One-shot: spawn, capture stdout, wait for exit, write result file. No WebSocket streaming. No `ptyMap` entry.

Flow:
1. Client calls `POST /api/sessions/audit` with `{ projectId, planFile }`
2. Server resolves plan content, spec content (same base filename in specs_dir, optional), memory content
3. Spawns `claude --print` with the combined prompt piped to stdin
4. On exit: writes result to `{plans_dir}/audits/{plan-basename}-audit-{YYYY-MM-DD}.md` with structured frontmatter (see below)
5. Invalidates plan files query so badge re-renders
6. Returns `{ ok: true, auditFile: string }` — client shows toast "Audit complete → View"

### Audit output format

The prompt instructs Claude to produce this exact structure at the top of its response:

```markdown
---
blockers: 0
warnings: 2
audited_at: 2026-03-26T14:00:00Z
plan_file: auth.md
---

# Audit: auth.md
...
```

Badge colour is derived from the **frontmatter**, not emoji parsing:
- `blockers > 0` → red
- `blockers === 0 && warnings > 0` → amber
- `blockers === 0 && warnings === 0` → green

### Prompt structure (`lib/prompts.ts`)

```typescript
audit: (planFile, planContent, specContent, memoryContent) => `
You are auditing an implementation plan. Respond with this EXACT format (frontmatter first, then report):

---
blockers: {count}
warnings: {count}
audited_at: {ISO timestamp}
plan_file: {filename}
---

# Audit: {filename}

## 🔴 Blockers
...

## 🟡 Warnings
...

## 🟢 Ready
...

## Memory Conflicts
...

---

## Project Memory
${memoryContent || 'None'}

## Spec
${specContent || 'Not available'}

## Plan
${planContent}
`
```

### Result display on plan cards

- On load, `GET /api/files?projectId=&dir=plans` already returns all plan files
- A separate `GET /api/memory/audit-status?projectId=` returns a map of `{ [planBasename]: { blockers, warnings, file } }` by scanning the `audits/` subdirectory and parsing frontmatter of each audit file (most recent per plan). Route file lives at `app/api/memory/audit-status/route.ts`.
- Plan cards consume this map to show the badge

---

## File structure

```
app/
  (dashboard)/
    memory/
      page.tsx
  api/
    memory/
      route.ts              ← GET, PUT, DELETE
      audit-status/
        route.ts            ← GET (scans audits/ dir, returns badge map)
    sessions/
      audit/
        route.ts            ← POST (spawns claude --print)
lib/
  memory.ts                 ← path resolver, file reader, frontmatter parser
hooks/
  useMemory.ts
components/
  MemoryDrawer.tsx
  nav/
    TopNav.tsx              ← add Memory nav item
```

---

## Build order

1. `lib/memory.ts` — path resolver + file reader + frontmatter parser
2. `app/api/memory/route.ts` — GET / PUT / DELETE
3. `hooks/useMemory.ts`
4. `components/MemoryDrawer.tsx`
5. `app/(dashboard)/memory/page.tsx`
6. `components/nav/TopNav.tsx` — add Memory link
7. `lib/prompts.ts` — add `'audit'` to Phase union + audit template
8. `app/api/sessions/audit/route.ts` — spawn claude --print, write result
9. `app/api/memory/audit-status/route.ts` — scan audits/, return badge map
10. `app/(dashboard)/plans/page.tsx` — add "Run Audit" action + badge display
