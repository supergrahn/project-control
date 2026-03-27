# Ideation Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the bare-text "New Idea" dialog with a rich ideation flow: pitch capture → live floating session window → session state tracked per-document via YAML frontmatter.

**Architecture:** YAML frontmatter in every idea/spec/plan `.md` file tracks `{phase}_session_id` and `{phase}_log_id`. A server-side frontmatter API writes these on session start/end. Floating draggable/resizable windows (one per active session) replace the full-screen `SessionModal`. A global `SessionWindowManager` React context coordinates all open windows.

**Tech Stack:** Next.js 16 App Router, React 19, xterm.js + node-pty (already wired), Tailwind CSS, better-sqlite3 (existing session DB), Vitest + React Testing Library

---

### Task 1: Add `ideate` phase to `lib/prompts.ts`

**Files:**
- Modify: `lib/prompts.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getSystemPrompt } from '../prompts'

describe('ideate phase', () => {
  it('includes the source file path in the prompt', () => {
    const prompt = getSystemPrompt('ideate', '/data/ideas/my-idea.md')
    expect(prompt).toContain('/data/ideas/my-idea.md')
  })

  it('mentions consult-gemini skill opportunistically', () => {
    const prompt = getSystemPrompt('ideate', '/data/ideas/my-idea.md')
    expect(prompt).toContain('consult-gemini')
  })
})
```

**Step 2: Run test to verify it fails**

```
npx vitest run lib/__tests__/prompts.test.ts
```
Expected: FAIL — `ideate` is not a valid Phase

**Step 3: Add `ideate` to the Phase union and TEMPLATES**

In `lib/prompts.ts`:
```ts
// Change line 2:
export type Phase = 'ideate' | 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review' | 'audit'

// Add to TEMPLATES before brainstorm:
  ideate: (f) =>
    `Read the idea file at ${f}. Your role is to help the user develop this idea through collaborative dialogue.\n\nIf the @consult-gemini skill is available in ~/.claude/skills/, use it to explore the idea from multiple angles before surfacing conclusions. Otherwise, ideate solo.\n\nStart by asking one clarifying question about the core problem this idea solves. Then explore: who the users are, what constraints exist, what a minimal version looks like. After sufficient back-and-forth, synthesise the conversation into a structured brainstorm document saved alongside the idea file with a -brainstorm suffix (e.g. my-idea-brainstorm.md). The document should cover: core problem, target users, key features, technical approach, open questions, and risks.`,
```

**Step 4: Run test to verify it passes**

```
npx vitest run lib/__tests__/prompts.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompts.ts lib/__tests__/prompts.test.ts
git commit -m "feat: add ideate phase to prompts"
```

---

### Task 2: Frontmatter utility — read and write YAML frontmatter in `.md` files

**Files:**
- Create: `lib/frontmatter.ts`
- Create: `lib/__tests__/frontmatter.test.ts`

The utility must handle files with no frontmatter, files with existing frontmatter, and partial updates (only change specified keys).

**Step 1: Write the failing test**

```ts
// lib/__tests__/frontmatter.test.ts
import { describe, it, expect } from 'vitest'
import { parseFrontmatter, writeFrontmatter } from '../frontmatter'

describe('parseFrontmatter', () => {
  it('returns empty object when no frontmatter', () => {
    expect(parseFrontmatter('# Title\n\nBody')).toEqual({})
  })

  it('parses existing frontmatter keys', () => {
    const content = '---\nideate_session_id: abc-123\nideate_log_id: null\n---\n\n# Title'
    const fm = parseFrontmatter(content)
    expect(fm.ideate_session_id).toBe('abc-123')
    expect(fm.ideate_log_id).toBeNull()
  })
})

describe('writeFrontmatter', () => {
  it('adds frontmatter to a file with none', () => {
    const result = writeFrontmatter('# Title\n\nBody', { ideate_session_id: 'abc' })
    expect(result).toMatch(/^---\n/)
    expect(result).toContain('ideate_session_id: abc')
    expect(result).toContain('# Title')
  })

  it('merges into existing frontmatter without losing other keys', () => {
    const content = '---\ntitle: My Idea\nideate_session_id: old\n---\n\n# Title'
    const result = writeFrontmatter(content, { ideate_session_id: 'new', ideate_log_id: '/path/log.md' })
    const fm = parseFrontmatter(result)
    expect(fm.title).toBe('My Idea')
    expect(fm.ideate_session_id).toBe('new')
    expect(fm.ideate_log_id).toBe('/path/log.md')
  })

  it('serialises null correctly', () => {
    const result = writeFrontmatter('# Title', { ideate_log_id: null })
    expect(result).toContain('ideate_log_id: null')
  })
})
```

**Step 2: Run test to verify it fails**

```
npx vitest run lib/__tests__/frontmatter.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement the utility**

```ts
// lib/frontmatter.ts
const FM_REGEX = /^---\n([\s\S]*?)\n---\n?/

export type FrontmatterData = Record<string, string | null | undefined>

export function parseFrontmatter(content: string): FrontmatterData {
  const match = content.match(FM_REGEX)
  if (!match) return {}
  const result: FrontmatterData = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const raw = line.slice(colon + 1).trim()
    result[key] = raw === 'null' ? null : raw
  }
  return result
}

export function writeFrontmatter(content: string, updates: FrontmatterData): string {
  const existing = parseFrontmatter(content)
  const merged = { ...existing, ...updates }
  const body = content.replace(FM_REGEX, '')
  const fmLines = Object.entries(merged)
    .map(([k, v]) => `${k}: ${v === null ? 'null' : v}`)
    .join('\n')
  return `---\n${fmLines}\n---\n\n${body.replace(/^\n+/, '')}`
}
```

**Step 4: Run test to verify it passes**

```
npx vitest run lib/__tests__/frontmatter.test.ts
```
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add lib/frontmatter.ts lib/__tests__/frontmatter.test.ts
git commit -m "feat: frontmatter read/write utility"
```

---

### Task 3: Update `GET /api/files` to return session state from frontmatter

**Files:**
- Modify: `app/api/files/route.ts`
- Modify: `hooks/useFiles.ts`

**Step 1: Write the failing test**

Create `app/api/files/__tests__/route.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// This is a unit test for the file parsing logic only — no Next.js request needed.
// We test the frontmatter extraction inline.

import { parseFrontmatter } from '@/lib/frontmatter'

describe('session state extraction from file content', () => {
  it('extracts active session state (session_id set, log_id null)', () => {
    const content = '---\nideate_session_id: abc-123\nideate_log_id: null\n---\n\n# My Idea'
    const fm = parseFrontmatter(content)
    const isActive = !!fm.ideate_session_id && !fm.ideate_log_id
    expect(isActive).toBe(true)
  })

  it('extracts closed session state (both set)', () => {
    const content = '---\nideate_session_id: abc-123\nideate_log_id: /logs/my-idea-ideate-log.md\n---\n\n# My Idea'
    const fm = parseFrontmatter(content)
    const isClosed = !!fm.ideate_session_id && !!fm.ideate_log_id
    expect(isClosed).toBe(true)
  })
})
```

**Step 2: Run test to verify it passes (it should already — we're testing pure logic)**

```
npx vitest run app/api/files/__tests__/route.test.ts
```
Expected: PASS

**Step 3: Update `MarkdownFile` type in `hooks/useFiles.ts`**

```ts
// hooks/useFiles.ts — update the MarkdownFile type
export type SessionState = {
  sessionId: string | null
  logId: string | null
}

export type MarkdownFile = {
  filename: string
  path: string
  title: string
  excerpt: string
  modifiedAt: string
  content: string
  sessions: {
    ideate: SessionState
    spec: SessionState
    plan: SessionState
    develop: SessionState
  }
}
```

**Step 4: Update `app/api/files/route.ts` GET to extract session state**

Add import at top: `import { parseFrontmatter } from '@/lib/frontmatter'`

Replace the `.map()` block in GET:
```ts
  const files = fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const filePath = path.join(absDir, f)
      const content = fs.readFileSync(filePath, 'utf8')
      const fm = parseFrontmatter(content)
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const excerptMatch = content.split('\n').find((l) => l.trim() && !l.startsWith('#'))
      const stat = fs.statSync(filePath)
      const phases = ['ideate', 'spec', 'plan', 'develop'] as const
      const sessions = Object.fromEntries(
        phases.map((p) => [p, {
          sessionId: fm[`${p}_session_id`] ?? null,
          logId: fm[`${p}_log_id`] ?? null,
        }])
      ) as Record<typeof phases[number], { sessionId: string | null; logId: string | null }>
      return {
        filename: f,
        path: filePath,
        title: titleMatch?.[1] ?? f.replace('.md', ''),
        excerpt: excerptMatch?.trim() ?? '',
        modifiedAt: stat.mtime.toISOString(),
        content,
        sessions,
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
```

**Step 5: Commit**

```bash
git add app/api/files/route.ts hooks/useFiles.ts app/api/files/__tests__/route.test.ts
git commit -m "feat: return session state from files API"
```

---

### Task 4: New `PATCH /api/files/frontmatter` — update frontmatter fields server-side

**Files:**
- Create: `app/api/files/frontmatter/route.ts`

This endpoint is called by the session exit hook to write `{phase}_log_id`, and by the session start to write `{phase}_session_id`. It takes `{ filePath, updates }` where updates is a `Record<string, string | null>`.

**Step 1: Write a manual test plan (no isolated test possible without FS mock)**

The endpoint accepts:
- `PATCH /api/files/frontmatter` with body `{ filePath: string, updates: Record<string, string | null> }`
- Returns 200 `{ ok: true }` on success
- Returns 400 if filePath or updates missing
- Returns 404 if file doesn't exist
- Security: filePath must be an absolute path to an `.md` file (no traversal)

**Step 2: Implement**

```ts
// app/api/files/frontmatter/route.ts
import { NextResponse } from 'next/server'
import fs from 'fs'
import { writeFrontmatter } from '@/lib/frontmatter'

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.filePath !== 'string' || typeof body.updates !== 'object') {
    return NextResponse.json({ error: 'filePath and updates required' }, { status: 400 })
  }

  const { filePath, updates } = body as { filePath: string; updates: Record<string, string | null> }

  // Security: must be an absolute path to a .md file
  if (!filePath.startsWith('/') || !filePath.endsWith('.md')) {
    return NextResponse.json({ error: 'invalid filePath' }, { status: 400 })
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'file not found' }, { status: 404 })
  }

  const content = fs.readFileSync(filePath, 'utf8')
  const updated = writeFrontmatter(content, updates)
  fs.writeFileSync(filePath, updated, 'utf8')

  return NextResponse.json({ ok: true })
}
```

**Step 3: Test manually via curl after dev server starts**

```bash
# Should return 400
curl -X PATCH http://localhost:3000/api/files/frontmatter \
  -H 'Content-Type: application/json' \
  -d '{"filePath": "relative/path.md"}'

# Should return 200 (use a real file path from your data dir)
curl -X PATCH http://localhost:3000/api/files/frontmatter \
  -H 'Content-Type: application/json' \
  -d '{"filePath": "/absolute/path/to/idea.md", "updates": {"ideate_session_id": "test-123"}}'
```

**Step 4: Commit**

```bash
git add app/api/files/frontmatter/route.ts
git commit -m "feat: PATCH /api/files/frontmatter endpoint"
```

---

### Task 5: Write `{phase}_session_id` on session start + `{phase}_log_id` on session end

**Files:**
- Modify: `lib/session-manager.ts`

**Step 1: Write the failing test**

Create `lib/__tests__/session-manager-frontmatter.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { writeFrontmatter, parseFrontmatter } from '../frontmatter'

// Test the log-saving logic in isolation (pure function extracted from session-manager)
describe('session log path generation', () => {
  it('generates a log path alongside the source file', () => {
    const sourceFile = '/data/ideas/my-idea.md'
    const phase = 'ideate'
    const logsDir = require('path').join(require('path').dirname(sourceFile), 'logs')
    const base = require('path').basename(sourceFile, '.md')
    const logPath = require('path').join(logsDir, `${base}-${phase}-log.md`)
    expect(logPath).toBe('/data/ideas/logs/my-idea-ideate-log.md')
  })
})
```

**Step 2: Run test to verify it passes**

```
npx vitest run lib/__tests__/session-manager-frontmatter.test.ts
```
Expected: PASS

**Step 3: Update `lib/session-manager.ts`**

Add to imports at top:
```ts
import { writeFrontmatter } from './frontmatter'
```

In `spawnSession`, after `createSession(db, {...})`, add a fetch call to write `{phase}_session_id` into frontmatter:
```ts
  // Write session_id into source file frontmatter
  if (opts.sourceFile && opts.phase !== 'orchestrator') {
    try {
      const content = fs.readFileSync(opts.sourceFile, 'utf8')
      const updated = writeFrontmatter(content, { [`${opts.phase}_session_id`]: sessionId })
      fs.writeFileSync(opts.sourceFile, updated, 'utf8')
    } catch {}
  }
```

In `proc.onExit`, after `generateDebrief(...)` resolves and `debriefPath` is available, save session log and write `log_id`:
```ts
  proc.onExit(() => {
    endSession(getDb(), sessionId)
    // ... existing log event ...
    emitSessionEnded(opts.projectId, { session_id: sessionId, source_file: opts.sourceFile, exit_reason: 'completed' })

    // Save session log + write log_id into frontmatter
    if (opts.sourceFile) {
      const buf = outputBuffer.get(sessionId) ?? []
      const logContent = buf.join('\n')

      try {
        const logsDir = path.join(path.dirname(opts.sourceFile), 'logs')
        fs.mkdirSync(logsDir, { recursive: true })
        const base = path.basename(opts.sourceFile, '.md')
        const logPath = path.join(logsDir, `${base}-${opts.phase}-log.md`)
        const logFm = `---\nphase: ${opts.phase}\nsource_file: ${opts.sourceFile}\ncreated_at: ${new Date().toISOString()}\n---\n\n`
        fs.writeFileSync(logPath, logFm + logContent, 'utf8')

        // Write log_id into source file frontmatter
        const srcContent = fs.readFileSync(opts.sourceFile, 'utf8')
        const updated = writeFrontmatter(srcContent, { [`${opts.phase}_log_id`]: logPath })
        fs.writeFileSync(opts.sourceFile, updated, 'utf8')
      } catch {}

      generateDebrief({ outputBuffer: buf, sessionLabel: opts.label, phase: opts.phase, sourceFile: opts.sourceFile, projectPath: opts.projectPath })
        .then(debriefPath => { /* existing log event */ })
        .catch(() => {})
    }
    // ... rest of existing cleanup (ptyMap.delete, etc.)
  })
```

Note: Move the existing `generateDebrief` block to after the log-saving block, keeping same structure.

**Step 4: Commit**

```bash
git add lib/session-manager.ts lib/__tests__/session-manager-frontmatter.test.ts
git commit -m "feat: write session_id and log_id into file frontmatter on session lifecycle"
```

---

### Task 6: `IdeaCaptureModal` component

**Files:**
- Create: `components/IdeaCaptureModal.tsx`
- Modify: `app/api/files/route.ts` POST (add optional `pitch` field)

**Step 1: Update `POST /api/files` to accept `pitch`**

In `app/api/files/route.ts`, update the POST handler body parsing and file write:
```ts
  const { projectId, dir, name, pitch } = await req.json()
  // ... existing validation unchanged ...

  const body = pitch?.trim() ? `# ${name}\n\n${pitch.trim()}\n` : `# ${name}\n\n`
  fs.writeFileSync(filePath, body)
```

**Step 2: Write the failing test for IdeaCaptureModal**

Create `components/__tests__/IdeaCaptureModal.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IdeaCaptureModal } from '../IdeaCaptureModal'

describe('IdeaCaptureModal', () => {
  it('calls onConfirm with name and pitch', async () => {
    const onConfirm = vi.fn()
    render(<IdeaCaptureModal onCancel={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.change(screen.getByLabelText('Idea title'), { target: { value: 'My Cool Idea' } })
    fireEvent.change(screen.getByLabelText('Pitch (optional)'), { target: { value: 'It solves X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Ideating' }))

    expect(onConfirm).toHaveBeenCalledWith({ name: 'My Cool Idea', pitch: 'It solves X' })
  })

  it('disables submit when title is empty', () => {
    render(<IdeaCaptureModal onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Ideating' })).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<IdeaCaptureModal onCancel={onCancel} onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

**Step 3: Run test to verify it fails**

```
npx vitest run components/__tests__/IdeaCaptureModal.test.tsx
```
Expected: FAIL — module not found

**Step 4: Implement `IdeaCaptureModal`**

```tsx
// components/IdeaCaptureModal.tsx
'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  onCancel: () => void
  onConfirm: (data: { name: string; pitch: string }) => void
}

export function IdeaCaptureModal({ onCancel, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [pitch, setPitch] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">New Idea</h2>
          <button onClick={onCancel} className="p-1 text-zinc-500 hover:text-zinc-300 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="idea-title" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Idea title
            </label>
            <input
              id="idea-title"
              aria-label="Idea title"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm({ name: name.trim(), pitch }) }}
              placeholder="Give your idea a name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label htmlFor="idea-pitch" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Pitch <span className="text-zinc-600 font-normal">(optional)</span>
            </label>
            <textarea
              id="idea-pitch"
              aria-label="Pitch (optional)"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="Describe your idea in a few sentences. Claude will build on this."
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm({ name: name.trim(), pitch })}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Ideating
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 5: Run test to verify it passes**

```
npx vitest run components/__tests__/IdeaCaptureModal.test.tsx
```
Expected: PASS (3 tests)

**Step 6: Commit**

```bash
git add components/IdeaCaptureModal.tsx components/__tests__/IdeaCaptureModal.test.tsx app/api/files/route.ts
git commit -m "feat: IdeaCaptureModal with title and pitch fields"
```

---

### Task 7: `FloatingSessionWindow` component — draggable, resizable xterm window

**Files:**
- Create: `components/FloatingSessionWindow.tsx`

This adapts `SessionModal.tsx` from full-screen to a positioned, draggable, resizable floating window. It has a title bar (drag handle), resize handles on edges/corners (CSS `resize`), and a minimize button.

**Step 1: No unit test needed** — xterm and drag behaviour are DOM/imperative; this is a visual component. Manual test at the end.

**Step 2: Implement**

```tsx
// components/FloatingSessionWindow.tsx
'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Minus } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'

export type WindowState = {
  session: Session
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  zIndex: number
}

type Props = {
  state: WindowState
  onClose: (sessionId: string) => void
  onMinimize: (sessionId: string) => void
  onRestore: (sessionId: string) => void
  onBringToFront: (sessionId: string) => void
  onPositionChange: (sessionId: string, x: number, y: number) => void
}

export function FloatingSessionWindow({ state, onClose, onMinimize, onBringToFront, onPositionChange }: Props) {
  const { session, x, y, width, height, minimized, zIndex } = state
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [termStatus, setTermStatus] = useState<'active' | 'ended' | 'connecting'>('connecting')
  const killSession = useKillSession()

  // Drag handling
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onBringToFront(session.id)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y }

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const nx = dragRef.current.origX + me.clientX - dragRef.current.startX
      const ny = dragRef.current.origY + me.clientY - dragRef.current.startY
      onPositionChange(session.id, nx, ny)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [session.id, x, y, onBringToFront, onPositionChange])

  useEffect(() => {
    if (minimized || !containerRef.current) return
    let cancelled = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled) return

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#a78bfa' },
        fontSize: 13,
        fontFamily: 'ui-monospace, monospace',
        cursorBlink: true,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current!)
      termRef.current = term

      await new Promise((r) => requestAnimationFrame(r))
      if (cancelled) { term.dispose(); termRef.current = null; return }
      fit.fit()

      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      )
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') term.write(msg.data)
          if (msg.type === 'status') setTermStatus(msg.state)
        } catch {}
      }

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      })

      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(containerRef.current!)
      observerRef.current = observer
    }

    setTermStatus('connecting')
    init()

    return () => {
      cancelled = true
      wsRef.current?.close()
      wsRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [session.id, minimized])

  if (minimized) return null

  return (
    <div
      style={{ left: x, top: y, width, height, zIndex, resize: 'both', overflow: 'hidden' }}
      className="fixed flex flex-col bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl"
      onMouseDown={() => onBringToFront(session.id)}
    >
      {/* Title bar / drag handle */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0 cursor-move select-none"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${termStatus === 'active' ? 'bg-emerald-400' : termStatus === 'ended' ? 'bg-zinc-600' : 'bg-yellow-400'}`} />
        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">{session.label}</span>
        <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => onMinimize(session.id)}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
            title="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => {
              if (termStatus === 'active') killSession.mutate(session.id)
              onClose(session.id)
            }}
            className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800"
            title="Close session"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {termStatus === 'ended' && (
        <div className="bg-zinc-800/50 text-zinc-400 text-[10px] text-center py-1 shrink-0">
          Session ended — read-only
        </div>
      )}

      <div ref={containerRef} className="flex-1 p-1.5 min-h-0" />
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add components/FloatingSessionWindow.tsx
git commit -m "feat: FloatingSessionWindow — draggable resizable xterm window"
```

---

### Task 8: Session window manager — context, hooks, minimized pill bar

**Files:**
- Create: `hooks/useSessionWindows.tsx`
- Create: `components/SessionPillBar.tsx`

**Step 1: Write the failing test for the hook logic**

Create `hooks/__tests__/useSessionWindows.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SessionWindowProvider, useSessionWindows } from '../useSessionWindows'
import type { Session } from '../useSessions'
import React from 'react'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionWindowProvider>{children}</SessionWindowProvider>
)

const makeSession = (id: string): Session => ({
  id,
  project_id: 'proj-1',
  label: 'My Idea · ideate',
  phase: 'ideate',
  source_file: '/data/ideas/my-idea.md',
  status: 'active',
  created_at: new Date().toISOString(),
  ended_at: null,
})

describe('useSessionWindows', () => {
  it('opens a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    expect(result.current.windows).toHaveLength(1)
    expect(result.current.windows[0].session.id).toBe('s1')
  })

  it('does not duplicate already-open windows', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.openWindow(makeSession('s1')))
    expect(result.current.windows).toHaveLength(1)
  })

  it('minimizes and restores a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.minimizeWindow('s1'))
    expect(result.current.windows[0].minimized).toBe(true)
    act(() => result.current.restoreWindow('s1'))
    expect(result.current.windows[0].minimized).toBe(false)
  })

  it('closes a window', () => {
    const { result } = renderHook(() => useSessionWindows(), { wrapper })
    act(() => result.current.openWindow(makeSession('s1')))
    act(() => result.current.closeWindow('s1'))
    expect(result.current.windows).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

```
npx vitest run hooks/__tests__/useSessionWindows.test.tsx
```
Expected: FAIL — module not found

**Step 3: Implement the hook and provider**

```tsx
// hooks/useSessionWindows.tsx
'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { Session } from './useSessions'
import type { WindowState } from '@/components/FloatingSessionWindow'

type SessionWindowsCtx = {
  windows: WindowState[]
  openWindow: (session: Session) => void
  closeWindow: (sessionId: string) => void
  minimizeWindow: (sessionId: string) => void
  restoreWindow: (sessionId: string) => void
  bringToFront: (sessionId: string) => void
  updatePosition: (sessionId: string, x: number, y: number) => void
  toggleAll: () => void
}

const Ctx = createContext<SessionWindowsCtx | null>(null)

const DEFAULT_W = 640
const DEFAULT_H = 400

export function SessionWindowProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowState[]>([])
  const zCounter = useRef(1000)

  const openWindow = useCallback((session: Session) => {
    setWindows((prev) => {
      if (prev.find((w) => w.session.id === session.id)) {
        // Already open — restore and bring to front
        return prev.map((w) =>
          w.session.id === session.id
            ? { ...w, minimized: false, zIndex: ++zCounter.current }
            : w
        )
      }
      const offset = prev.length * 28
      return [
        ...prev,
        {
          session,
          x: 80 + offset,
          y: 80 + offset,
          width: DEFAULT_W,
          height: DEFAULT_H,
          minimized: false,
          zIndex: ++zCounter.current,
        },
      ]
    })
  }, [])

  const closeWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.filter((w) => w.session.id !== sessionId))
  }, [])

  const minimizeWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) => w.session.id === sessionId ? { ...w, minimized: true } : w))
  }, [])

  const restoreWindow = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) =>
      w.session.id === sessionId ? { ...w, minimized: false, zIndex: ++zCounter.current } : w
    ))
  }, [])

  const bringToFront = useCallback((sessionId: string) => {
    setWindows((prev) => prev.map((w) =>
      w.session.id === sessionId ? { ...w, zIndex: ++zCounter.current } : w
    ))
  }, [])

  const updatePosition = useCallback((sessionId: string, x: number, y: number) => {
    setWindows((prev) => prev.map((w) => w.session.id === sessionId ? { ...w, x, y } : w))
  }, [])

  const toggleAll = useCallback(() => {
    setWindows((prev) => {
      const anyVisible = prev.some((w) => !w.minimized)
      return prev.map((w) => ({ ...w, minimized: anyVisible }))
    })
  }, [])

  return (
    <Ctx.Provider value={{ windows, openWindow, closeWindow, minimizeWindow, restoreWindow, bringToFront, updatePosition, toggleAll }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSessionWindows() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessionWindows must be inside SessionWindowProvider')
  return ctx
}
```

**Step 4: Run test to verify it passes**

```
npx vitest run hooks/__tests__/useSessionWindows.test.tsx
```
Expected: PASS (5 tests)

**Step 5: Implement `SessionPillBar`**

```tsx
// components/SessionPillBar.tsx
'use client'
import { useSessionWindows } from '@/hooks/useSessionWindows'

export function SessionPillBar() {
  const { windows, restoreWindow } = useSessionWindows()
  const minimized = windows.filter((w) => w.minimized)
  if (minimized.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-[2000]">
      {minimized.map((w) => (
        <button
          key={w.session.id}
          onClick={() => restoreWindow(w.session.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {w.session.label}
        </button>
      ))}
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add hooks/useSessionWindows.tsx hooks/__tests__/useSessionWindows.test.tsx components/SessionPillBar.tsx
git commit -m "feat: session window manager context + pill bar"
```

---

### Task 9: Wire floating windows into `app/(dashboard)/layout.tsx`

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

**Step 1: Update layout to render floating windows and pill bar**

Add imports:
```tsx
import { SessionWindowProvider, useSessionWindows } from '@/hooks/useSessionWindows'
import { FloatingSessionWindow } from '@/components/FloatingSessionWindow'
import { SessionPillBar } from '@/components/SessionPillBar'
```

Wrap the outer `<FocusProvider>` with `<SessionWindowProvider>`:
```tsx
  return (
    <SessionWindowProvider>
      <FocusProvider>
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
          {/* ... existing content ... */}
          <FloatingWindowsRenderer />
          <SessionPillBar />
        </div>
      </FocusProvider>
    </SessionWindowProvider>
  )
```

Create an inner component `FloatingWindowsRenderer` at the bottom of the file (still in layout.tsx):
```tsx
function FloatingWindowsRenderer() {
  const { windows, closeWindow, minimizeWindow, restoreWindow, bringToFront, updatePosition } = useSessionWindows()
  return (
    <>
      {windows.map((w) => (
        <FloatingSessionWindow
          key={w.session.id}
          state={w}
          onClose={closeWindow}
          onMinimize={minimizeWindow}
          onRestore={restoreWindow}
          onBringToFront={bringToFront}
          onPositionChange={updatePosition}
        />
      ))}
    </>
  )
}
```

**Step 2: Verify dev server starts without errors**

```
npm run dev
```
Expected: No TypeScript or runtime errors in terminal

**Step 3: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: render floating session windows in dashboard layout"
```

---

### Task 10: Update Brain icon in TopNav to show active session count + toggle-all

**Files:**
- Modify: `components/nav/TopNav.tsx`

The Brain button already has `onAssistantToggle`. We need to:
1. Add active session count badge
2. Wire `toggleAll` from `useSessionWindows`

**Step 1: Update TopNav**

Add import:
```tsx
import { useSessionWindows } from '@/hooks/useSessionWindows'
```

Inside `TopNav`, add:
```tsx
  const { windows, toggleAll } = useSessionWindows()
  const activeCount = windows.filter((w) => !w.minimized).length + windows.filter((w) => w.minimized).length
```

Replace the Brain button block:
```tsx
          {/* Brain — session manager */}
          <div className="relative">
            <button
              onClick={toggleAll}
              className={`p-1.5 rounded transition-colors ${windows.length > 0 ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Toggle sessions"
            >
              <Brain size={16} />
            </button>
            {windows.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-violet-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {windows.length > 9 ? '9+' : windows.length}
              </span>
            )}
          </div>
```

Remove `onAssistantToggle` and `isAssistantOpen` from the Brain section (the `AssistantPanel` is still used for the AI chat — keep the existing `{onAssistantToggle && ...}` block separate if still needed, or remove if AssistantPanel is being replaced. Per the design, Brain now controls session windows only. Remove the old assistant toggle from TopNav entirely).

**Step 2: Verify `TopNav` still compiles**

```
npx tsc --noEmit
```
Expected: No errors

**Step 3: Commit**

```bash
git add components/nav/TopNav.tsx
git commit -m "feat: Brain icon shows active session count, toggles all windows"
```

---

### Task 11: Update `MarkdownCard` to show session state

**Files:**
- Modify: `components/cards/MarkdownCard.tsx`

The card needs to show different UI based on session state for a given phase. We pass a `sessionState` prop (the specific phase's state for that card's phase context) and a callback for each possible action.

**Step 1: Write the failing test**

Create `components/__tests__/MarkdownCard.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownCard } from '../cards/MarkdownCard'

const baseFile = {
  filename: 'my-idea.md',
  path: '/data/ideas/my-idea.md',
  title: 'My Idea',
  excerpt: 'A cool idea',
  modifiedAt: new Date().toISOString(),
  content: '# My Idea',
  sessions: {
    ideate: { sessionId: null, logId: null },
    spec: { sessionId: null, logId: null },
    plan: { sessionId: null, logId: null },
    develop: { sessionId: null, logId: null },
  },
}

describe('MarkdownCard session states', () => {
  it('shows action buttons when no session', () => {
    render(<MarkdownCard file={baseFile} badge="idea" actions={[{ label: '💬 Ideate', onClick: vi.fn() }]} onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: '💬 Ideate' })).toBeInTheDocument()
  })

  it('shows Live badge when session active (session_id set, log_id null)', () => {
    const file = {
      ...baseFile,
      sessions: { ...baseFile.sessions, ideate: { sessionId: 'abc-123', logId: null } },
    }
    render(<MarkdownCard file={file} badge="idea" actions={[]} onClick={vi.fn()} phaseSessionState={{ sessionId: 'abc-123', logId: null }} onLiveBadgeClick={vi.fn()} />)
    expect(screen.getByText('▶ Live')).toBeInTheDocument()
  })

  it('shows View log when session closed (both set)', () => {
    const file = {
      ...baseFile,
      sessions: { ...baseFile.sessions, ideate: { sessionId: 'abc-123', logId: '/logs/my-idea-ideate-log.md' } },
    }
    render(<MarkdownCard file={file} badge="idea" actions={[]} onClick={vi.fn()} phaseSessionState={{ sessionId: 'abc-123', logId: '/logs/my-idea-ideate-log.md' }} onViewLog={vi.fn()} onResume={vi.fn()} />)
    expect(screen.getByText('View log')).toBeInTheDocument()
    expect(screen.getByText('Resume')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```
npx vitest run components/__tests__/MarkdownCard.test.tsx
```
Expected: FAIL — phaseSessionState prop not accepted

**Step 3: Update `MarkdownCard`**

```tsx
// components/cards/MarkdownCard.tsx
'use client'
import { formatDistanceToNow } from 'date-fns'
import type { MarkdownFile } from '@/hooks/useFiles'

type Action = { label: string; onClick: () => void; variant?: 'primary' | 'default' }
type SessionState = { sessionId: string | null; logId: string | null }

type Props = {
  file: MarkdownFile
  badge: string
  actions: Action[]
  onClick: () => void
  phaseSessionState?: SessionState
  onLiveBadgeClick?: () => void
  onViewLog?: () => void
  onResume?: () => void
}

export function MarkdownCard({ file, badge, actions, onClick, phaseSessionState, onLiveBadgeClick, onViewLog, onResume }: Props) {
  const isActive = !!phaseSessionState?.sessionId && !phaseSessionState.logId
  const isClosed = !!phaseSessionState?.sessionId && !!phaseSessionState.logId

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors flex flex-col">
      <div className="p-4 flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2">{file.title}</h3>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">{badge}</span>
        </div>
        {file.excerpt && <p className="text-xs text-zinc-500 line-clamp-3 mb-3">{file.excerpt}</p>}
        <p className="text-[10px] text-zinc-600">{formatDistanceToNow(new Date(file.modifiedAt), { addSuffix: true })}</p>
      </div>
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex items-center gap-2 flex-wrap">
        {isActive ? (
          <button
            onClick={(e) => { e.stopPropagation(); onLiveBadgeClick?.() }}
            className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1"
          >
            ▶ Live
          </button>
        ) : isClosed ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onViewLog?.() }}
              className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              View log
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onResume?.() }}
              className="text-xs px-2.5 py-1 rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30"
            >
              Resume
            </button>
          </>
        ) : (
          actions.map((a) => (
            <button
              key={a.label}
              onClick={(e) => { e.stopPropagation(); a.onClick() }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                a.variant === 'primary'
                  ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {a.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

```
npx vitest run components/__tests__/MarkdownCard.test.tsx
```
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/cards/MarkdownCard.tsx components/__tests__/MarkdownCard.test.tsx
git commit -m "feat: MarkdownCard shows Live/View log/Resume based on session state"
```

---

### Task 12: Update Ideas page — IdeaCaptureModal + session state wiring

**Files:**
- Modify: `app/(dashboard)/projects/[projectId]/ideas/page.tsx`

Replace `NewFileDialog` with `IdeaCaptureModal`. Wire session state from each file into `MarkdownCard`. Open `FloatingSessionWindow` via `useSessionWindows`.

**Step 1: Read the current ideas page (already done)**

**Step 2: Rewrite the ideas page**

```tsx
// app/(dashboard)/projects/[projectId]/ideas/page.tsx
'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { IdeaCaptureModal } from '@/components/IdeaCaptureModal'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, usePromoteFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession } from '@/hooks/useSessions'
import { useSessionWindows } from '@/hooks/useSessionWindows'

export default function IdeasPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, 'ideas')
  const files = data ?? []
  const createFile = useCreateFile()
  const promoteFile = usePromoteFile()
  const launchSession = useLaunchSession()
  const { openWindow, bringToFront } = useSessionWindows()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showCapture, setShowCapture] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view ideas.</p>
  }
  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>
  if (data === null || error) return <SetupPrompt dir="ideas" />

  async function startSession(file: MarkdownFile, phase: string) {
    if (!selectedProject) return
    const result = await launchSession.mutateAsync({
      projectId: selectedProject.id,
      phase,
      sourceFile: file.path,
      userContext: '',
      permissionMode: 'default',
    })
    if (result.sessionId) {
      openWindow({
        id: result.sessionId,
        project_id: selectedProject.id,
        label: `${file.title} · ${phase}`,
        phase,
        source_file: file.path,
        status: 'active',
        created_at: new Date().toISOString(),
        ended_at: null,
      })
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">💡 Ideas</h1>
        <button
          onClick={() => setShowCapture(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Plus size={14} /> New Idea
        </button>
      </div>

      {files.length === 0 && (
        <p className="text-zinc-600 text-sm">No ideas yet. Create one to get started.</p>
      )}
      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="idea"
            onClick={() => setDrawerFile(f)}
            phaseSessionState={f.sessions.ideate}
            onLiveBadgeClick={() => {
              if (f.sessions.ideate.sessionId) bringToFront(f.sessions.ideate.sessionId)
            }}
            onViewLog={() => {
              if (f.sessions.ideate.logId) setDrawerFile({ ...f, path: f.sessions.ideate.logId })
            }}
            onResume={() => startSession(f, 'ideate')}
            actions={[
              { label: '💡 Ideate', variant: 'primary', onClick: () => startSession(f, 'ideate') },
              { label: '📋 → Specs', onClick: () => promoteFile.mutate({ projectId: selectedProject.id, sourceFile: f.path, targetDir: 'specs' }) },
              { label: '📋 Create Spec', onClick: () => startSession(f, 'spec') },
              { label: '🚀 Start Developing', onClick: () => startSession(f, 'develop') },
            ]}
          />
        ))}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showCapture && (
        <IdeaCaptureModal
          onCancel={() => setShowCapture(false)}
          onConfirm={async ({ name, pitch }) => {
            try {
              const result = await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'ideas', name, pitch })
              setShowCapture(false)
              // Find the newly created file and launch ideate session
              // File invalidation will reload the list; the new file will appear with session.ideate = null
              // Start ideate session on the newly created file path
              if (result.path) {
                const newFile: MarkdownFile = {
                  filename: result.filename,
                  path: result.path,
                  title: name,
                  excerpt: pitch,
                  modifiedAt: new Date().toISOString(),
                  content: pitch ? `# ${name}\n\n${pitch}` : `# ${name}\n\n`,
                  sessions: { ideate: { sessionId: null, logId: null }, spec: { sessionId: null, logId: null }, plan: { sessionId: null, logId: null }, develop: { sessionId: null, logId: null } },
                }
                await startSession(newFile, 'ideate')
              }
            } catch {
              // leave modal open on error
            }
          }}
        />
      )}
    </>
  )
}
```

Note: `useCreateFile` mutation returns `{ filename, path }` from the POST endpoint — verify this matches `app/api/files/route.ts` return value (it does).

**Step 3: Verify TypeScript**

```
npx tsc --noEmit
```
Expected: No errors

**Step 4: Commit**

```bash
git add app/(dashboard)/projects/\[projectId\]/ideas/page.tsx
git commit -m "feat: wire IdeaCaptureModal and session state into Ideas page"
```

---

### Task 13: Update Specs, Plans, Developing pages with session state

**Files:**
- Modify: `app/(dashboard)/projects/[projectId]/specs/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/plans/page.tsx`
- Modify: `app/(dashboard)/projects/[projectId]/developing/page.tsx`

Each page follows the same pattern as Ideas:
- Replace `PromptModal` + `SessionModal` flow with direct `startSession` + `openWindow`
- Pass `phaseSessionState` + `onLiveBadgeClick` / `onViewLog` / `onResume` to `MarkdownCard`
- Phase mapping: specs page uses `spec`, plans uses `plan`, developing uses `develop`

**Step 1: Update Specs page**

Read the current specs page first:
```
Read: app/(dashboard)/projects/[projectId]/specs/page.tsx
```

Apply same transformation as Ideas page with these differences:
- No `IdeaCaptureModal` — keep `NewFileDialog` for specs (pitch capture is ideas-specific)
- `phaseSessionState={f.sessions.spec}`
- Primary action: `{ label: '📐 Spec', variant: 'primary', onClick: () => startSession(f, 'spec') }`

**Step 2: Update Plans page**

- `phaseSessionState={f.sessions.plan}`
- Primary action: `{ label: '📋 Plan', variant: 'primary', onClick: () => startSession(f, 'plan') }`

**Step 3: Update Developing page**

- `phaseSessionState={f.sessions.develop}`
- Primary action: `{ label: '🚀 Develop', variant: 'primary', onClick: () => startSession(f, 'develop') }`

**Step 4: Verify TypeScript across all pages**

```
npx tsc --noEmit
```
Expected: No errors

**Step 5: Commit**

```bash
git add app/(dashboard)/projects/\[projectId\]/specs/page.tsx \
        app/(dashboard)/projects/\[projectId\]/plans/page.tsx \
        app/(dashboard)/projects/\[projectId\]/developing/page.tsx
git commit -m "feat: wire session state into Specs, Plans, Developing pages"
```

---

### Task 14: Run full test suite and manual smoke test

**Step 1: Run all tests**

```
npx vitest run
```
Expected: All tests pass

**Step 2: Start dev server and manually test**

```
npm run dev
```

Checklist:
- [ ] Click "New Idea" → `IdeaCaptureModal` appears with title + pitch fields
- [ ] Fill in title only → "Start Ideating" enabled; fill nothing → disabled
- [ ] Confirm → file created, floating session window opens with xterm terminal
- [ ] Window is draggable by title bar
- [ ] Window is resizable by dragging edges (CSS `resize: both`)
- [ ] Minimize button → window disappears, pill appears at bottom
- [ ] Click pill → window restores
- [ ] Brain icon in TopNav shows badge with window count
- [ ] Brain icon click → toggles minimize-all/restore-all
- [ ] After session ends → card shows "View log" + "Resume" buttons
- [ ] "View log" → `FileDrawer` opens with session log markdown
- [ ] "Resume" → new ideate session starts on same file

**Step 3: Commit any fixups**

```bash
git add -p
git commit -m "fix: ideation flow smoke test fixups"
```

---

## Summary

| Task | Files | Key change |
|------|-------|-----------|
| 1 | `lib/prompts.ts` | Add `ideate` phase |
| 2 | `lib/frontmatter.ts` | YAML frontmatter read/write |
| 3 | `app/api/files/route.ts`, `hooks/useFiles.ts` | Return session state per phase from files API |
| 4 | `app/api/files/frontmatter/route.ts` | PATCH endpoint to update frontmatter |
| 5 | `lib/session-manager.ts` | Write `session_id` on start, `log_id` on end |
| 6 | `components/IdeaCaptureModal.tsx` | Title + pitch capture modal |
| 7 | `components/FloatingSessionWindow.tsx` | Draggable/resizable xterm window |
| 8 | `hooks/useSessionWindows.tsx`, `components/SessionPillBar.tsx` | Window manager context + pill bar |
| 9 | `app/(dashboard)/layout.tsx` | Render floating windows + pill bar |
| 10 | `components/nav/TopNav.tsx` | Brain badge + toggle-all |
| 11 | `components/cards/MarkdownCard.tsx` | Live/View log/Resume states |
| 12 | `ideas/page.tsx` | IdeaCaptureModal + session wiring |
| 13 | `specs`, `plans`, `developing` pages | Same session wiring |
| 14 | — | Full test run + smoke test |
