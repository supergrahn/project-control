# Feature Preparation — Stolen Features + Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the codebase for 9 upcoming features by building shared infrastructure (session context builder, git history utility, correction note flow, event log, command palette), updating the roadmap, and making the existing session/prompt system extensible.

**Architecture:** Refactor `lib/prompts.ts` into an extensible session context builder that supports pluggable sections (git history, notes, corrections). Add `lib/git.ts` for git utilities. Add `lib/events.ts` + DB table for a cross-project event log. Add a command palette component with keyboard shortcut infrastructure.

**Tech Stack:** Next.js 16 App Router, TypeScript, TanStack Query v5, better-sqlite3, Tailwind v4, Vitest

---

## Features being imported

From `task-dashboard/docs/superpowers/specs/2026-03-26-dashboard-improvements-design.md`:
1. **Git history in session prompts** — inject recent `git log` into Claude session context
2. **Handoff correction notes** — modal before session launch to flag issues with prior phase
3. **Command palette** — `Cmd+K` to search projects, features, actions

From `task-dashboard/docs/superpowers/specs/2026-03-27-orchestrator-design.md`:
4. **Decision/event feed** — log of what happened across projects (session started, audit completed, etc.)
5. **Contextual suggested actions** — smarter action buttons based on feature state

Already on roadmap (from Gemini consultation):
6. Smart Prompt Fragments
7. Permanent Memory Pinning
8. Post-Session Handoff Summaries
9. Git Diff Overlay
10. Plan-to-Spec Gap Analysis
11. Cross-Project Knowledge Search

---

## What this plan builds (foundation only)

This plan does NOT implement all 11 features. It builds the **shared foundation** that multiple features need, plus the 3 quickest wins that are self-contained:

| Task | What | Enables |
|------|------|---------|
| 1 | `lib/git.ts` — git history utility | Git history in prompts, Git diff overlay |
| 2 | Refactor session context builder | Git history, notes, corrections, memory pinning, prompt fragments |
| 3 | Wire git history into session launch | Immediate value — Claude gets project context |
| 4 | `lib/events.ts` + DB table — event logging | Decision feed, activity tracking, handoff summaries |
| 5 | Emit events from existing actions | Feed has data immediately |
| 6 | Correction note modal + session API | Handoff corrections work end-to-end |
| 7 | Command palette component + hook | Keyboard-driven navigation |
| 8 | Update roadmap memory | Future sessions know the full plan |

---

### Task 1: `lib/git.ts` — git utilities

**Files:**
- Create: `lib/git.ts`
- Create: `tests/lib/git.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/lib/git.test.ts
import { describe, it, expect } from 'vitest'
import { getGitHistory } from '@/lib/git'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

describe('getGitHistory', () => {
  let tmpDir: string

  it('returns null for non-git directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    expect(getGitHistory(tmpDir)).toBeNull()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns recent commits for a git repo', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    execFileSync('git', ['init'], { cwd: tmpDir })
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir })
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'hello')
    execFileSync('git', ['add', '.'], { cwd: tmpDir })
    execFileSync('git', ['commit', '-m', 'initial commit'], { cwd: tmpDir })

    const result = getGitHistory(tmpDir)
    expect(result).toContain('initial commit')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null for empty repo (no commits)', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-test-'))
    execFileSync('git', ['init'], { cwd: tmpDir })
    expect(getGitHistory(tmpDir)).toBeNull()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/git.test.ts 2>&1 | tail -20
```

- [ ] **Step 3: Create `lib/git.ts`**

```typescript
// lib/git.ts
import { execFileSync } from 'child_process'

/**
 * Returns the last N commits as a string (one-liner per commit).
 * Returns null on any failure (not a git repo, no commits, timeout).
 */
export function getGitHistory(projectPath: string, count: number = 5): string | null {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectPath, 'log', '--oneline', `-${count}`],
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return output || null
  } catch {
    return null
  }
}

/**
 * Returns a summary of uncommitted changes (staged + unstaged).
 * Returns null if clean or not a git repo.
 */
export function getGitStatus(projectPath: string): string | null {
  try {
    const output = execFileSync(
      'git',
      ['-C', projectPath, 'status', '--short'],
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()
    return output || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/git.test.ts 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/git.ts tests/lib/git.test.ts && git commit -m "feat: add lib/git.ts with getGitHistory and getGitStatus"
```

---

### Task 2: Refactor session context builder in `lib/prompts.ts`

**Files:**
- Modify: `lib/prompts.ts`

Add a `buildSessionContext` function that assembles an extended prompt from pluggable sections. The existing `getSystemPrompt` stays for backward compatibility — `buildSessionContext` wraps it with additional context.

- [ ] **Step 1: Add `buildSessionContext` to `lib/prompts.ts`**

After the existing `getSystemPrompt` function, add:

```typescript
export type SessionContext = {
  phase: Phase
  sourceFile: string | null
  userContext?: string
  gitHistory?: string | null
  correctionNote?: string | null
}

/**
 * Builds the full session context string from pluggable sections.
 * The base prompt comes from getSystemPrompt, then additional context is appended.
 */
export function buildSessionContext(ctx: SessionContext): string {
  const parts: string[] = []

  // Correction note from previous phase (highest priority — user override)
  if (ctx.correctionNote?.trim()) {
    parts.push(`> CORRECTION FROM PREVIOUS PHASE:\n> ${ctx.correctionNote.trim()}\n\n---\n`)
  }

  // Base system prompt
  const basePrompt = ctx.sourceFile
    ? getSystemPrompt(ctx.phase, ctx.sourceFile)
    : `You are helping with a ${ctx.phase} session.`
  parts.push(basePrompt)

  // Git history
  if (ctx.gitHistory) {
    parts.push(`\n\n## Recent Git History\n\n${ctx.gitHistory}`)
  }

  return parts.join('\n')
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/prompts.ts && git commit -m "feat: add buildSessionContext for extensible session prompts"
```

---

### Task 3: Wire git history into session launch

**Files:**
- Modify: `lib/session-manager.ts`
- Modify: `app/api/sessions/route.ts`

- [ ] **Step 1: Update `lib/session-manager.ts`**

Add `correctionNote` to `SpawnOptions`:

```typescript
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
  correctionNote?: string
}
```

Replace the system prompt building section (lines 69-71) with:

```typescript
  const systemPrompt = buildSessionContext({
    phase: opts.phase,
    sourceFile: opts.sourceFile,
    userContext: opts.userContext,
    gitHistory: getGitHistory(opts.projectPath),
    correctionNote: opts.correctionNote,
  })
```

Update the import at the top to include `buildSessionContext` from `./prompts` and `getGitHistory` from `./git`:

```typescript
import { buildArgs, buildSessionContext, Phase, PermissionMode } from './prompts'
import { getGitHistory } from './git'
```

Remove the unused `getSystemPrompt` import.

- [ ] **Step 2: Update `app/api/sessions/route.ts`**

Accept `correctionNote` from the POST body and pass it to `spawnSession`:

```typescript
const { projectId, phase, sourceFile, userContext = '', permissionMode = 'default', correctionNote } = body
```

And in the spawnSession call:

```typescript
    const sessionId = spawnSession({
      projectId,
      projectPath: project.path,
      label,
      phase,
      sourceFile: sourceFile ?? null,
      userContext,
      permissionMode,
      correctionNote: correctionNote ?? undefined,
    })
```

- [ ] **Step 3: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/session-manager.ts app/api/sessions/route.ts && git commit -m "feat: wire git history and correction notes into session launch"
```

---

### Task 4: `lib/events.ts` + DB table — event logging

**Files:**
- Modify: `lib/db.ts`
- Create: `lib/events.ts`
- Create: `tests/lib/events.test.ts`

- [ ] **Step 1: Add events table migration to `lib/db.ts`**

After the existing migrations in `initDb`, add:

```typescript
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         TEXT PRIMARY KEY,
      project_id TEXT,
      type       TEXT NOT NULL,
      summary    TEXT NOT NULL,
      detail     TEXT,
      severity   TEXT NOT NULL DEFAULT 'info',
      created_at TEXT NOT NULL
    )
  `) } catch {}
```

- [ ] **Step 2: Write failing tests for `lib/events.ts`**

```typescript
// tests/lib/events.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, _resetDbSingleton } from '@/lib/db'
import { logEvent, getRecentEvents, type AppEvent } from '@/lib/events'
import type Database from 'better-sqlite3'

describe('events', () => {
  let db: Database.Database

  beforeEach(() => {
    _resetDbSingleton()
    db = initDb(':memory:')
  })

  afterEach(() => {
    db.close()
    _resetDbSingleton()
  })

  it('logEvent inserts and getRecentEvents retrieves', () => {
    logEvent(db, { projectId: 'p1', type: 'session_started', summary: 'Started develop session', severity: 'info' })
    logEvent(db, { projectId: 'p1', type: 'audit_completed', summary: 'Audit found 2 blockers', severity: 'warn' })

    const events = getRecentEvents(db, 10)
    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('audit_completed')
    expect(events[1].type).toBe('session_started')
  })

  it('getRecentEvents respects limit', () => {
    for (let i = 0; i < 5; i++) {
      logEvent(db, { projectId: 'p1', type: 'test', summary: `event ${i}`, severity: 'info' })
    }
    expect(getRecentEvents(db, 3)).toHaveLength(3)
  })

  it('getRecentEvents filters by projectId', () => {
    logEvent(db, { projectId: 'p1', type: 'a', summary: 'for p1', severity: 'info' })
    logEvent(db, { projectId: 'p2', type: 'b', summary: 'for p2', severity: 'info' })

    const events = getRecentEvents(db, 10, 'p1')
    expect(events).toHaveLength(1)
    expect(events[0].summary).toBe('for p1')
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/events.test.ts 2>&1 | tail -20
```

- [ ] **Step 4: Create `lib/events.ts`**

```typescript
// lib/events.ts
import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'

export type EventSeverity = 'info' | 'warn' | 'error'

export type AppEvent = {
  id: string
  projectId: string | null
  type: string
  summary: string
  detail: string | null
  severity: EventSeverity
  createdAt: string
}

export function logEvent(db: Database.Database, data: {
  projectId?: string | null
  type: string
  summary: string
  detail?: string
  severity: EventSeverity
}): void {
  db.prepare(`INSERT INTO events (id, project_id, type, summary, detail, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), data.projectId ?? null, data.type, data.summary, data.detail ?? null, data.severity, new Date().toISOString())
}

export function getRecentEvents(db: Database.Database, limit: number, projectId?: string): AppEvent[] {
  if (projectId) {
    return db.prepare(`SELECT id, project_id as projectId, type, summary, detail, severity, created_at as createdAt FROM events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(projectId, limit) as AppEvent[]
  }
  return db.prepare(`SELECT id, project_id as projectId, type, summary, detail, severity, created_at as createdAt FROM events ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as AppEvent[]
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/events.test.ts 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/db.ts lib/events.ts tests/lib/events.test.ts && git commit -m "feat: add event logging system (lib/events.ts + DB table)"
```

---

### Task 5: Emit events from existing actions

**Files:**
- Modify: `lib/session-manager.ts`
- Modify: `app/api/sessions/audit/route.ts`

Add event logging at natural action points:

- [ ] **Step 1: Log events when sessions start and end**

In `lib/session-manager.ts`, import events:

```typescript
import { logEvent } from './events'
```

After `createSession(db, ...)` succeeds (around line 96), add:

```typescript
    logEvent(db, {
      projectId: opts.projectId,
      type: 'session_started',
      summary: `Started ${opts.phase} session: ${opts.label}`,
      severity: 'info',
    })
```

In the `proc.onExit` callback (around line 123), after `endSession`, add:

```typescript
    logEvent(getDb(), {
      projectId: opts.projectId,
      type: 'session_ended',
      summary: `${opts.phase} session ended: ${opts.label}`,
      severity: 'info',
    })
```

- [ ] **Step 2: Log events when audits complete**

In `app/api/sessions/audit/route.ts`, import events:

```typescript
import { logEvent } from '@/lib/events'
```

After writing the audit file (before the return), add:

```typescript
  const blockerCount = (output.match(/^- /gm) || []).length
  logEvent(getDb(), {
    projectId,
    type: 'audit_completed',
    summary: `Audit of ${planFilename}: ${frontmatter.includes('blockers: 0') ? 'clean' : 'issues found'}`,
    severity: frontmatter.includes('blockers: 0') ? 'info' : 'warn',
  })
```

- [ ] **Step 3: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/session-manager.ts app/api/sessions/audit/route.ts && git commit -m "feat: emit events on session start/end and audit completion"
```

---

### Task 6: Correction note modal + PromptModal update

**Files:**
- Modify: `components/PromptModal.tsx`
- Modify: `hooks/useSessions.ts`

The correction note is shown inline in the existing PromptModal when the phase is `develop` — no separate modal needed. Add a textarea that appears for develop phase.

- [ ] **Step 1: Update `PromptModal.tsx`**

Read the current file first. Add a `correctionNote` state and textarea. Update the `onLaunch` callback signature to include `correctionNote`:

Change the Props type:
```typescript
type Props = {
  phase: Phase
  sourceFile: string
  onLaunch: (userContext: string, permissionMode: PermissionMode, correctionNote?: string) => void
  onCancel: () => void
}
```

Add state:
```typescript
const [correctionNote, setCorrectionNote] = useState('')
```

Add a textarea section after the user context textarea, only for `develop` phase:
```typescript
{phase === 'develop' && (
  <div className="mb-4">
    <label className="block text-xs text-zinc-400 mb-1.5">
      Correction notes <span className="text-zinc-600">(optional — anything the plan got wrong?)</span>
    </label>
    <textarea
      value={correctionNote}
      onChange={(e) => setCorrectionNote(e.target.value)}
      placeholder="Flag issues from the plan or previous phase..."
      rows={2}
      className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 resize-none"
    />
  </div>
)}
```

Update the Launch button onClick:
```typescript
onClick={() => onLaunch(userContext, permissionMode, correctionNote || undefined)}
```

- [ ] **Step 2: Update callers of PromptModal**

Read `app/(dashboard)/plans/page.tsx` and `app/(dashboard)/page.tsx` — update their `onLaunch` callbacks to accept and pass `correctionNote`.

In the plans page `onLaunch`:
```typescript
onLaunch={async (userContext, permissionMode, correctionNote) => {
  // ...existing code...
  const result = await launchSession.mutateAsync({
    projectId: selectedProject.id,
    phase: config.phase,
    sourceFile: config.sourceFile,
    userContext,
    permissionMode,
    correctionNote,
  })
  // ...
}}
```

Same pattern in the dashboard page.

- [ ] **Step 3: Update `hooks/useSessions.ts` launch mutation**

The `useLaunchSession` mutation already accepts any body fields. Just need to make sure `correctionNote` is included in the type:

```typescript
mutationFn: (data: {
  projectId: string
  phase: string
  sourceFile: string | null
  userContext?: string
  permissionMode?: string
  correctionNote?: string
}) =>
```

- [ ] **Step 4: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add components/PromptModal.tsx app/\(dashboard\)/plans/page.tsx app/\(dashboard\)/page.tsx hooks/useSessions.ts && git commit -m "feat: add correction note field to PromptModal and session launch"
```

---

### Task 7: Command palette

**Files:**
- Create: `components/CommandPalette.tsx`
- Create: `hooks/useCommandPalette.ts`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create `hooks/useCommandPalette.ts`**

```typescript
// hooks/useCommandPalette.ts
import { useState, useEffect, useCallback, useMemo } from 'react'

export type Command = {
  id: string
  label: string
  group?: string
  keywords?: string[]
  action: () => void
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.startsWith(q)) return 3
  if (t.includes(q)) return 2
  // All chars present in order
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length ? 1 : 0
}

export function useCommandPalette(commands: Command[]) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const open = useCallback(() => { setIsOpen(true); setQuery('') }, [])
  const close = useCallback(() => { setIsOpen(false); setQuery('') }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
        setQuery('')
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, close])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands.slice(0, 8)
    return commands
      .map(cmd => {
        const labelScore = fuzzyScore(query, cmd.label)
        const keywordScore = Math.max(0, ...(cmd.keywords?.map(k => fuzzyScore(query, k)) ?? [0]))
        return { cmd, score: Math.max(labelScore, keywordScore) }
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score || a.cmd.label.localeCompare(b.cmd.label))
      .slice(0, 8)
      .map(r => r.cmd)
  }, [commands, query])

  return { isOpen, open, close, query, setQuery, filtered }
}
```

- [ ] **Step 2: Create `components/CommandPalette.tsx`**

```typescript
// components/CommandPalette.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
import type { Command } from '@/hooks/useCommandPalette'

type Props = {
  commands: Command[]
  query: string
  onQueryChange: (q: string) => void
  onClose: () => void
}

export function CommandPalette({ commands, query, onQueryChange, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { setActiveIndex(0) }, [commands])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, commands.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && commands[activeIndex]) {
      e.preventDefault()
      commands[activeIndex].action()
      onClose()
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Search size={14} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder-zinc-600"
          />
          <kbd className="text-[10px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">esc</kbd>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {commands.length === 0 && (
            <p className="px-4 py-6 text-sm text-zinc-600 text-center">No matching commands</p>
          )}
          {commands.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`flex items-center justify-between px-4 py-2 cursor-pointer transition-colors ${
                i === activeIndex ? 'bg-violet-500/10 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'
              }`}
              onClick={() => { cmd.action(); onClose() }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="text-sm">{cmd.label}</span>
              {cmd.group && <span className="text-[10px] text-zinc-600">{cmd.group}</span>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Wire into dashboard layout**

Modify `app/(dashboard)/layout.tsx` to include the command palette. Read the file first, then add:

Import at top:
```typescript
import { useRouter } from 'next/navigation'
import { useCommandPalette, type Command } from '@/hooks/useCommandPalette'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { CommandPalette } from '@/components/CommandPalette'
```

Inside the component, build commands from projects and static actions:

```typescript
const router = useRouter()
const { data: projects = [] } = useProjects()
const { openProject } = useProjectStore()

const commands: Command[] = useMemo(() => {
  const cmds: Command[] = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigate', action: () => router.push('/') },
    { id: 'nav-ideas', label: 'Go to Ideas', group: 'Navigate', action: () => router.push('/ideas') },
    { id: 'nav-specs', label: 'Go to Specs', group: 'Navigate', action: () => router.push('/specs') },
    { id: 'nav-plans', label: 'Go to Plans', group: 'Navigate', action: () => router.push('/plans') },
    { id: 'nav-developing', label: 'Go to Developing', group: 'Navigate', action: () => router.push('/developing') },
    { id: 'nav-memory', label: 'Go to Memory', group: 'Navigate', action: () => router.push('/memory') },
    { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => router.push('/settings') },
  ]
  for (const p of projects) {
    cmds.push({
      id: `project-${p.id}`,
      label: `Switch to: ${p.name}`,
      group: 'Projects',
      keywords: [p.name, p.path],
      action: () => { openProject(p); router.push('/') },
    })
  }
  return cmds
}, [projects, openProject, router])

const palette = useCommandPalette(commands)
```

Add the palette component in the JSX:

```tsx
{palette.isOpen && (
  <CommandPalette
    commands={palette.filtered}
    query={palette.query}
    onQueryChange={palette.setQuery}
    onClose={palette.close}
  />
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /home/tomespen/git/project-control && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add hooks/useCommandPalette.ts components/CommandPalette.tsx app/\(dashboard\)/layout.tsx && git commit -m "feat: add command palette with Cmd+K shortcut"
```

---

### Task 8: Update roadmap memory

**Files:**
- Modify: `~/.claude/projects/-home-tomespen-git-project-control/memory/project_roadmap.md`

- [ ] **Step 1: Update the roadmap memory file**

Replace the content with the updated feature list that includes the stolen features and marks completed items.

- [ ] **Step 2: Commit** (no git commit needed — this is a Claude memory file, not in the repo)

---

### Final verification

- [ ] All tests pass: `cd /home/tomespen/git/project-control && npm test 2>&1 | tail -15`
- [ ] TypeScript clean: `npx tsc --noEmit`
- [ ] Launch a develop session from /plans — system prompt should include recent git history
- [ ] The develop PromptModal shows a "Correction notes" textarea
- [ ] `Cmd+K` opens command palette from any page
- [ ] Type a project name → see "Switch to: {name}" option
- [ ] Navigate commands work (Go to Plans, etc.)
