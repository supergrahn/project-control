# Workflow Enhancements — Design Spec

**Date:** 2026-03-27

---

## Overview

Five features that transform the dashboard from a project manager into a full development intelligence hub: research integration, automated session debriefs, cross-project search, decision harvesting, and tech stack auditing.

---

## Feature 1: Research Context Packs

### Goal
Feed external knowledge (documentation, articles, notes) to Claude sessions as structured context, eliminating the "Claude doesn't know about this library" problem.

### How it works

**Storage:** A `context_packs` SQLite table stores named context packs per project. Each pack has a title, content (markdown text), and optional source URL.

```sql
CREATE TABLE context_packs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

**UI:** A "Context" section on each project's settings or a new `/context` page. Users can:
- Paste markdown/text content directly
- Paste a URL (dashboard fetches and extracts text content server-side)
- Edit/delete existing packs

**Injection:** When launching a session, `buildSessionContext()` in `lib/prompts.ts` includes active context packs for the project. Added as a `## Reference Documentation` section in the system prompt.

### New files
- `app/api/context-packs/route.ts` — CRUD
- `hooks/useContextPacks.ts` — query + mutations
- `components/ContextPackEditor.tsx` — create/edit modal
- `app/(dashboard)/context/page.tsx` — context packs page

### Complexity: Low-Medium

---

## Feature 2: Post-Session Debrief

### Goal
When a Claude session ends, automatically generate a structured summary of what was accomplished, what's pending, and what decisions were made — saved to the project for the next session.

### How it works

**Trigger:** In `lib/session-manager.ts`, when `proc.onExit` fires, if the session has a `source_file` (not an orchestrator), capture the PTY output buffer and spawn a one-shot `claude --print` to summarize it.

**Output:** A markdown debrief file saved to `{project}/docs/debriefs/{session-label}-{date}.md`:

```markdown
---
session_id: abc-123
phase: develop
source_file: plans/auth-system.md
created_at: 2026-03-27T10:00:00Z
---

# Session Debrief: auth-system · develop

## Completed
- Implemented JWT token refresh logic
- Added tests for token expiry edge cases

## Pending
- Error handling for network failures not yet done
- Need to update the API docs

## Key Decisions
- Used refresh token rotation instead of sliding expiry
- Stored tokens in httpOnly cookies, not localStorage

## Files Changed
- lib/auth.ts (new)
- tests/auth.test.ts (new)
- lib/middleware.ts (modified)
```

**Integration:** Debriefs are indexed by the dashboard and shown on the project's session history. The next session for the same feature automatically gets the previous debrief injected into its prompt via `buildSessionContext()`.

### New files
- `lib/debrief.ts` — `generateDebrief(outputBuffer, sessionMeta)` → spawns claude --print
- Modify: `lib/session-manager.ts` — trigger debrief on session exit
- Modify: `lib/prompts.ts` — inject last debrief into `buildSessionContext`

### Complexity: Medium

---

## Feature 3: Cross-Project Knowledge Search

### Goal
Search across ALL projects' ideas, specs, plans, memory, and debriefs from a single search box. Find solutions that were solved in one project when facing the same problem in another.

### How it works

**Index:** SQLite FTS5 virtual table indexing all markdown content:

```sql
CREATE VIRTUAL TABLE search_index USING fts5(
  project_id,
  project_name,
  file_path,
  file_type,    -- 'idea' | 'spec' | 'plan' | 'memory' | 'debrief'
  title,
  content,
  tokenize='porter'
);
```

**Indexing:** A `rebuildSearchIndex()` function scans all projects, reads all markdown files, and populates the FTS5 table. Called on startup and via a manual "Reindex" button.

**Search API:** `GET /api/search?q=auth+token&projectId=optional` returns ranked results with snippets.

**UI:** Global search accessible via `Cmd+Shift+K` (separate from command palette) or a `/search` page. Results show: project name, file type badge, title, snippet with highlights.

### New files
- `lib/search.ts` — `rebuildSearchIndex`, `searchContent`
- `app/api/search/route.ts` — GET search
- `app/(dashboard)/search/page.tsx` — search page
- `hooks/useSearch.ts` — search hook with debounce

### Complexity: Medium

---

## Feature 4: Session Insights (ADR Harvester)

### Goal
Automatically extract key technical decisions, patterns, and learnings from session debriefs and surface them as searchable "insights" — building institutional knowledge over time.

### How it works

**Trigger:** After a debrief is generated (Feature 2), a second LLM pass extracts structured insights:

```typescript
type Insight = {
  id: string
  project_id: string
  session_id: string
  category: 'decision' | 'pattern' | 'warning' | 'learning'
  title: string        // one-line summary
  detail: string       // 2-3 sentences
  tags: string[]       // auto-generated: ['auth', 'jwt', 'security']
  created_at: string
}
```

**Storage:** `insights` SQLite table. Shown on a `/insights` page grouped by category.

**Cross-project value:** The AI Assistant's system prompt includes recent insights from all projects, so Claude can reference decisions made elsewhere.

### New files
- `lib/insights.ts` — `extractInsights(debriefContent)` → LLM call, `listInsights`
- DB migration for `insights` table
- `app/api/insights/route.ts` — GET list
- `app/(dashboard)/insights/page.tsx` — insights browser
- `hooks/useInsights.ts`

### Complexity: Medium

---

## Feature 5: Tech Stack Auditor

### Goal
Scan all registered projects' `package.json` files and surface version drift, outdated dependencies, and inconsistencies across the portfolio.

### How it works

**Scanner:** `lib/tech-audit.ts` reads `package.json` from each project root. Compares:
- Same package, different versions across projects
- Packages with known security issues (via `npm audit --json`)
- Projects missing common shared dependencies

**Output:** A structured report per scan:

```typescript
type TechAuditReport = {
  projects: Array<{
    projectId: string
    projectName: string
    nodeVersion: string | null
    packageCount: number
    outdatedCount: number
  }>
  drift: Array<{
    package: string
    versions: Array<{ projectName: string; version: string }>
  }>
  recommendations: string[]
  scannedAt: string
}
```

**UI:** A `/tech-audit` page showing the drift matrix. No LLM call needed — pure file parsing.

### New files
- `lib/tech-audit.ts` — `scanTechStack(projects)` pure function
- `app/api/tech-audit/route.ts` — GET
- `app/(dashboard)/tech-audit/page.tsx` — audit page
- `hooks/useTechAudit.ts`

### Complexity: Low

---

## Build Order

1. **Tech Stack Auditor** (Feature 5) — no dependencies, pure file parsing
2. **Research Context Packs** (Feature 1) — DB + CRUD + prompt injection
3. **Cross-Project Knowledge Search** (Feature 3) — FTS5 index + search UI
4. **Post-Session Debrief** (Feature 2) — depends on session manager
5. **Session Insights** (Feature 4) — depends on debriefs
