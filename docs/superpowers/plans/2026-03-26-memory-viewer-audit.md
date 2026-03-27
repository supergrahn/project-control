# Memory Viewer + LLM Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Memory page that reads/edits Claude Code's auto-memory files per project, and an LLM audit feature on plan cards that runs `claude --print` and writes a structured report.

**Architecture:** `lib/memory.ts` handles path resolution and file I/O; a REST API at `/api/memory` handles CRUD; hooks mirror the existing `useFiles` pattern; `MemoryDrawer` extends the drawer pattern with an editable textarea; the audit spawns `child_process.spawn('claude', ['--print'])` one-shot (no PTY) and writes a frontmatter-tagged markdown report.

**Tech Stack:** Next.js 16 App Router, TypeScript, TanStack Query v5, better-sqlite3, Tailwind v4, `child_process` (Node built-in), Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-memory-viewer-audit-design.md`

---

### Task 1: `lib/memory.ts` — path resolver, frontmatter parser, file reader

**Files:**
- Create: `lib/memory.ts`
- Create: `tests/lib/memory.test.ts`

The memory directory for a project at `/home/user/git/foo` is `~/.claude/projects/-home-user-git-foo/memory/` (every `/` replaced with `-`). No external YAML library — parse frontmatter with regex.

- [ ] **Step 1: Create test file**

```typescript
// tests/lib/memory.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { encodeProjectPath, resolveMemoryDir, parseMemoryFile, listMemoryFiles } from '@/lib/memory'

describe('encodeProjectPath', () => {
  it('replaces all slashes with dashes', () => {
    expect(encodeProjectPath('/home/user/git/foo')).toBe('-home-user-git-foo')
  })
  it('handles paths with hyphens in folder names', () => {
    expect(encodeProjectPath('/home/user/my-project')).toBe('-home-user-my-project')
  })
})

describe('parseMemoryFile', () => {
  const modifiedAt = '2026-03-26T00:00:00.000Z'

  it('extracts frontmatter fields', () => {
    const content = `---\nname: Test Memory\ndescription: A test\ntype: feedback\n---\n\nBody text`
    const result = parseMemoryFile('feedback_test.md', '/virtual/feedback_test.md', content, modifiedAt)
    expect(result.name).toBe('Test Memory')
    expect(result.description).toBe('A test')
    expect(result.type).toBe('feedback')
    expect(result.content).toBe(content)
    expect(result.modifiedAt).toBe(modifiedAt)
  })

  it('falls back to filename when frontmatter is missing', () => {
    const content = `# Just a heading\n\nSome text`
    const result = parseMemoryFile('project_goals.md', '/virtual/project_goals.md', content, modifiedAt)
    expect(result.name).toBe('project_goals')
    expect(result.type).toBe('project')
    expect(result.description).toBe('')
  })
})

describe('resolveMemoryDir', () => {
  let tmpDir: string
  let projectPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'))
    projectPath = '/home/testuser/git/myproject'
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns expected path when directory exists', () => {
    const encoded = encodeProjectPath(projectPath)
    const expectedDir = path.join(tmpDir, encoded, 'memory')
    fs.mkdirSync(expectedDir, { recursive: true })
    const result = resolveMemoryDir(projectPath, tmpDir)
    expect(result).toBe(expectedDir)
  })

  it('returns null when no matching directory', () => {
    const result = resolveMemoryDir(projectPath, tmpDir)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/memory.test.ts 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '@/lib/memory'`

- [ ] **Step 3: Create `lib/memory.ts`**

```typescript
// lib/memory.ts
import fs from 'fs'
import path from 'path'
import os from 'os'

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export type MemoryFile = {
  filename: string
  path: string
  name: string
  description: string
  type: MemoryType
  content: string
  modifiedAt: string
}

const TYPE_ORDER: MemoryType[] = ['project', 'feedback', 'user', 'reference']

export function encodeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-')
}

function inferType(filename: string): MemoryType {
  for (const t of TYPE_ORDER) {
    if (filename.startsWith(t + '_') || filename.startsWith(t + '.')) return t
  }
  return 'project'
}

// modifiedAt is passed in so this function is pure and testable without touching disk
export function parseMemoryFile(filename: string, filePath: string, content: string, modifiedAt: string): MemoryFile {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  let name = ''
  let description = ''
  let type: MemoryType = inferType(filename)

  if (fmMatch) {
    const fm = fmMatch[1]
    name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? ''
    description = fm.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? ''
    const rawType = fm.match(/^type:\s*(.+)$/m)?.[1]?.trim()
    if (rawType && TYPE_ORDER.includes(rawType as MemoryType)) {
      type = rawType as MemoryType
    }
  }

  if (!name) name = path.basename(filename, '.md')

  return { filename, path: filePath, name, description, type, content, modifiedAt }
}

export function resolveMemoryDir(projectPath: string, claudeProjectsBase?: string): string | null {
  const base = claudeProjectsBase ?? path.join(os.homedir(), '.claude', 'projects')
  const encoded = encodeProjectPath(projectPath)
  const expected = path.join(base, encoded, 'memory')

  if (fs.existsSync(expected)) return expected

  // Fallback: scan all subdirs for closest match
  if (!fs.existsSync(base)) return null
  const entries = fs.readdirSync(base, { withFileTypes: true })
  let bestMatch: string | null = null
  let bestScore = Infinity

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const memDir = path.join(base, entry.name, 'memory')
    if (!fs.existsSync(memDir)) continue
    const dist = levenshtein(entry.name, encoded)
    if (dist < bestScore && dist <= 3) {
      bestScore = dist
      bestMatch = memDir
    }
  }

  return bestMatch
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
  return dp[m][n]
}

export function listMemoryFiles(memoryDir: string): MemoryFile[] {
  const files = fs.readdirSync(memoryDir)
    .filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
    .map(f => {
      const filePath = path.join(memoryDir, f)
      const content = fs.readFileSync(filePath, 'utf8')
      const modifiedAt = fs.statSync(filePath).mtime.toISOString()
      return parseMemoryFile(f, filePath, content, modifiedAt)
    })

  return files.sort((a, b) => {
    const ta = TYPE_ORDER.indexOf(a.type)
    const tb = TYPE_ORDER.indexOf(b.type)
    if (ta !== tb) return ta - tb
    return b.modifiedAt.localeCompare(a.modifiedAt)
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /home/tomespen/git/project-control && npm test -- tests/lib/memory.test.ts 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/memory.ts tests/lib/memory.test.ts && git commit -m "feat: add lib/memory.ts with path resolver, frontmatter parser, file reader"
```

---

### Task 2: `app/api/memory/route.ts` — GET, PUT, DELETE

**Files:**
- Create: `app/api/memory/route.ts`

Follows the same pattern as `app/api/files/route.ts`. Uses `getProject` from `lib/db.ts`.

- [ ] **Step 1: Create `app/api/memory/route.ts`**

```typescript
// app/api/memory/route.ts
import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import { resolveMemoryDir, listMemoryFiles } from '@/lib/memory'
import fs from 'fs'
import path from 'path'

const FILENAME_RE = /^[\w-]+\.md$/

function getMemoryDir(projectId: string): { memoryDir: string; error?: never } | { memoryDir?: never; error: NextResponse } {
  const project = getProject(getDb(), projectId)
  if (!project) return { error: NextResponse.json({ error: 'project not found' }, { status: 404 }) }
  const memoryDir = resolveMemoryDir(project.path)
  if (!memoryDir) return { error: NextResponse.json(null) }
  return { memoryDir }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  return NextResponse.json(listMemoryFiles(memoryDir))
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const filename = searchParams.get('filename')

  if (!projectId || !filename) return NextResponse.json({ error: 'projectId and filename required' }, { status: 400 })
  if (!FILENAME_RE.test(filename)) return NextResponse.json({ error: 'invalid filename' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  const destPath = path.resolve(memoryDir, filename)
  if (!destPath.startsWith(memoryDir + path.sep)) {
    return NextResponse.json({ error: 'path traversal detected' }, { status: 400 })
  }

  const { content } = await req.json()
  if (typeof content !== 'string') return NextResponse.json({ error: 'content must be a string' }, { status: 400 })

  const tmpPath = destPath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, destPath)

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const filename = searchParams.get('filename')

  if (!projectId || !filename) return NextResponse.json({ error: 'projectId and filename required' }, { status: 400 })
  if (!FILENAME_RE.test(filename)) return NextResponse.json({ error: 'invalid filename' }, { status: 400 })

  const { memoryDir, error } = getMemoryDir(projectId)
  if (error) return error

  const targetPath = path.resolve(memoryDir, filename)
  if (!targetPath.startsWith(memoryDir + path.sep)) {
    return NextResponse.json({ error: 'path traversal detected' }, { status: 400 })
  }

  if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)

  // Best-effort: remove matching line from MEMORY.md index
  const indexPath = path.join(memoryDir, 'MEMORY.md')
  if (fs.existsSync(indexPath)) {
    const lines = fs.readFileSync(indexPath, 'utf8').split('\n')
    const filtered = lines.filter(l => !l.includes(`(${filename})`))
    if (filtered.length !== lines.length) {
      fs.writeFileSync(indexPath, filtered.join('\n'), 'utf8')
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify route responds correctly**

Start dev server if not running: `npm run dev`

```bash
# Should return null (no project) or a list
curl -s "http://localhost:3001/api/memory?projectId=INVALID" | head -c 100
```

Expected: `{"error":"project not found"}` or `null`

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/api/memory/route.ts && git commit -m "feat: add /api/memory GET/PUT/DELETE route"
```

---

### Task 3: `hooks/useMemory.ts`

**Files:**
- Create: `hooks/useMemory.ts`

Mirrors `hooks/useFiles.ts` exactly.

- [ ] **Step 1: Create `hooks/useMemory.ts`**

```typescript
// hooks/useMemory.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export type MemoryFile = {
  filename: string
  path: string
  name: string
  description: string
  type: MemoryType
  content: string
  modifiedAt: string
}

export function useMemory(projectId: string | null) {
  return useQuery<MemoryFile[] | null>({
    queryKey: ['memory', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/memory?projectId=${projectId}`)
      if (!r.ok) throw new Error(r.statusText)
      return r.json() as Promise<MemoryFile[] | null>
    },
    enabled: !!projectId,
  })
}

export function useUpdateMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; filename: string; content: string }) =>
      fetch(`/api/memory?projectId=${vars.projectId}&filename=${encodeURIComponent(vars.filename)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: vars.content }),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['memory', vars.projectId] }),
  })
}

export function useDeleteMemory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; filename: string }) =>
      fetch(`/api/memory?projectId=${vars.projectId}&filename=${encodeURIComponent(vars.filename)}`, {
        method: 'DELETE',
      }).then(r => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['memory', vars.projectId] }),
  })
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add hooks/useMemory.ts && git commit -m "feat: add useMemory, useUpdateMemory, useDeleteMemory hooks"
```

---

### Task 4: `components/MemoryDrawer.tsx`

**Files:**
- Create: `components/MemoryDrawer.tsx`

Editable drawer. Same overlay + aside structure as `FileDrawer`. Uses a `<textarea>` instead of `ReactMarkdown`. Shows Save + Delete in footer. Warns on unsaved close.

- [ ] **Step 1: Create `components/MemoryDrawer.tsx`**

```typescript
// components/MemoryDrawer.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { useUpdateMemory, useDeleteMemory, type MemoryFile } from '@/hooks/useMemory'

const TYPE_COLORS: Record<string, string> = {
  project: 'bg-violet-500/20 text-violet-300',
  feedback: 'bg-amber-500/20 text-amber-300',
  user: 'bg-sky-500/20 text-sky-300',
  reference: 'bg-zinc-500/20 text-zinc-400',
}

type Props = {
  file: MemoryFile | null
  projectId: string
  onClose: () => void
}

export function MemoryDrawer({ file, projectId, onClose }: Props) {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateMemory = useUpdateMemory()
  const deleteMemory = useDeleteMemory()

  useEffect(() => {
    if (file) {
      setContent(file.content)
      setSavedContent(file.content)
      setSaveState('idle')
      setConfirmDelete(false)
    }
  }, [file])

  if (!file) return null

  const isDirty = content !== savedContent

  const handleClose = () => {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return
    onClose()
  }

  const handleSave = async () => {
    setSaveState('saving')
    try {
      await updateMemory.mutateAsync({ projectId, filename: file.filename, content })
      setSavedContent(content)
      setSaveState('saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('idle')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    await deleteMemory.mutateAsync({ projectId, filename: file.filename })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={handleClose} />
      <aside className="fixed right-0 top-0 h-full w-[640px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[file.type] ?? TYPE_COLORS.reference}`}>
            {file.type}
          </span>
          <span className="text-zinc-100 font-semibold text-sm truncate flex-1">{file.name || file.filename}</span>
          {isDirty && <span className="text-[10px] text-amber-400">unsaved</span>}
          <button type="button" onClick={handleClose} className="text-zinc-500 hover:text-zinc-100 transition-colors p-1 rounded hover:bg-zinc-800 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        {file.description && (
          <p className="px-5 py-2 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-950/50">{file.description}</p>
        )}

        {/* Editor */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 resize-none bg-transparent text-sm font-mono text-zinc-200 px-5 py-4 outline-none leading-relaxed"
          spellCheck={false}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 shrink-0 bg-zinc-950/50">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                <Trash2 size={12} /> Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this memory?</span>
                <button type="button" onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveState === 'saving'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              saveState === 'saved'
                ? 'bg-green-500/20 text-green-300'
                : isDirty
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-zinc-800 text-zinc-600 cursor-default'
            }`}
          >
            <Save size={12} />
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add components/MemoryDrawer.tsx && git commit -m "feat: add MemoryDrawer component with inline editing, save, delete"
```

---

### Task 5: `app/(dashboard)/memory/page.tsx`

**Files:**
- Create: `app/(dashboard)/memory/page.tsx`

Follows the exact same structure as `ideas/page.tsx` — useProjectStore, loading/null states, card grid.

- [ ] **Step 1: Create the memory page**

```typescript
// app/(dashboard)/memory/page.tsx
'use client'
import { useState } from 'react'
import { Brain } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MemoryDrawer } from '@/components/MemoryDrawer'
import { useMemory, type MemoryFile } from '@/hooks/useMemory'
import { useProjectStore } from '@/hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'

const TYPE_COLORS: Record<string, string> = {
  project: 'bg-violet-500/20 text-violet-300',
  feedback: 'bg-amber-500/20 text-amber-300',
  user: 'bg-sky-500/20 text-sky-300',
  reference: 'bg-zinc-500/20 text-zinc-400',
}

const TYPE_LABELS: Record<string, string> = {
  project: 'project',
  feedback: 'feedback',
  user: 'user',
  reference: 'reference',
}

export default function MemoryPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading } = useMemory(selectedProject?.id ?? null)
  const [activeFile, setActiveFile] = useState<MemoryFile | null>(null)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view its memory.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading…</p>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Brain size={18} className="text-violet-400" /> Memory
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">What Claude remembers about this project across sessions</p>
        </div>
      </div>

      {(data === null || data?.length === 0) && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <Brain size={28} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">No memories yet</p>
          <p className="text-zinc-600 text-xs mt-1">Claude will create memory files automatically as you run sessions.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <CardGrid>
          {data.map(f => (
            <div
              key={f.path}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors flex flex-col cursor-pointer"
              onClick={() => setActiveFile(f)}
            >
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2">{f.name}</h3>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[f.type] ?? TYPE_COLORS.reference}`}>
                    {TYPE_LABELS[f.type]}
                  </span>
                </div>
                {f.description && (
                  <p className="text-xs text-zinc-500 line-clamp-2 mb-3">{f.description}</p>
                )}
                <p className="text-[10px] text-zinc-600">{formatDistanceToNow(new Date(f.modifiedAt), { addSuffix: true })}</p>
              </div>
              <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2">
                <span className="text-[10px] text-zinc-600 font-mono">{f.filename}</span>
              </div>
            </div>
          ))}
        </CardGrid>
      )}

      {selectedProject && (
        <MemoryDrawer
          file={activeFile}
          projectId={selectedProject.id}
          onClose={() => setActiveFile(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/\(dashboard\)/memory/page.tsx && git commit -m "feat: add Memory page"
```

---

### Task 6: Add Memory nav link to TopNav

**Files:**
- Modify: `components/nav/TopNav.tsx`

One-line change to the `NAV_ITEMS` array.

- [ ] **Step 1: Add Memory to NAV_ITEMS**

In `components/nav/TopNav.tsx`, find:

```typescript
const NAV_ITEMS = [
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
]
```

Replace with:

```typescript
const NAV_ITEMS = [
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
  { label: 'Memory', href: '/memory' },
]
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:3001 — "Memory" tab should appear in the nav. Clicking it should show the memory page (empty state if no sessions run yet for the selected project).

- [ ] **Step 3: Commit**

```bash
cd /home/tomespen/git/project-control && git add components/nav/TopNav.tsx && git commit -m "feat: add Memory link to top nav"
```

---

### Task 7: Add `audit` phase to `lib/prompts.ts`

**Files:**
- Modify: `lib/prompts.ts`

Add `'audit'` to the `Phase` union and a new template that instructs Claude to produce structured frontmatter output.

- [ ] **Step 1: Update `lib/prompts.ts`**

```typescript
// lib/prompts.ts
export type Phase = 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review' | 'audit'
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

const TEMPLATES: Record<Phase, (sourceFile: string) => string> = {
  brainstorm: (f) =>
    `Read the idea file at ${f}. Explore the idea through clarifying questions and deep analysis. Produce a structured brainstorm document covering: core problem, target users, key features, technical considerations, open questions, and risks. Save the result as a new .md file in the same directory with a -brainstorm suffix.`,
  spec: (f) =>
    `Read the idea/brainstorm file at ${f}. Produce a detailed technical spec covering: overview, architecture, components and their responsibilities, data models, API contracts, key user flows, edge cases, and out of scope items. Save as a .md file in the project's specs directory.`,
  plan: (f) =>
    `Read the spec at ${f}. Produce a step-by-step implementation plan broken into small, independently testable tasks. Each task should specify exact files to create or modify, the implementation approach, and how to verify it works. Save as a .md file in the project's plans directory.`,
  develop: (f) =>
    `Read the plan at ${f}. Implement it task by task. Follow any CLAUDE.md conventions in the project. Write tests before implementation (TDD). Commit after each task. Ask if anything in the plan is unclear before starting.`,
  review: (f) =>
    `Read the implementation described in ${f} and review the associated code changes. Check for: correctness, security vulnerabilities, edge cases not handled, code quality, test coverage, and adherence to project conventions. Produce a structured review report.`,
  audit: (_f) => '', // audit prompt is built dynamically in the audit route — this entry satisfies the type
}

export function getSystemPrompt(phase: Phase, sourceFile: string): string {
  return TEMPLATES[phase](sourceFile)
}

// Returns the prompt string. The route builds frontmatter separately from Claude's output
// using buildFrontmatter() so the timestamp is injected server-side, not by Claude.
export function buildAuditPrompt(opts: {
  planFilename: string
  planContent: string
  specContent: string | null
  memoryContent: string | null
}): string {
  return `You are auditing an implementation plan. Respond with ONLY the report body — no frontmatter, no preamble. Start your response directly with the "# Audit:" heading.

# Audit: ${opts.planFilename}

## 🔴 Blockers
Issues that will cause implementation failure (missing file paths, contradictory instructions, undefined dependencies, impossible steps). List each as a bullet: **[category]** Description. *Suggested fix.*
If none: write "None found."

## 🟡 Warnings
Issues that will cause friction, bugs, or incomplete implementation (vague steps, missing error handling, no rollback strategy, overly large tasks). List each as a bullet: **[category]** Description. *Suggested fix.*
If none: write "None found."

## 🟢 Ready
What looks solid and well-specified. 2-3 sentences.

## Memory Conflicts
Any contradictions between the plan and project memory. Write "None found." if clean.

---

## Project Memory
${opts.memoryContent ?? 'No memory files found for this project.'}

## Spec
${opts.specContent ?? 'No matching spec file found.'}

## Plan to audit
${opts.planContent}
`
}

// Counts bullet points in blocker/warning sections to build the frontmatter block
export function buildFrontmatter(body: string, auditedAt: string, planFilename: string): string {
  const blockersSection = body.match(/## 🔴 Blockers\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const warningsSection = body.match(/## 🟡 Warnings\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const blockers = blockersSection.includes('None found') ? 0 : (blockersSection.match(/^- /gm)?.length ?? 0)
  const warnings = warningsSection.includes('None found') ? 0 : (warningsSection.match(/^- /gm)?.length ?? 0)
  return `---\nblockers: ${blockers}\nwarnings: ${warnings}\naudited_at: ${auditedAt}\nplan_file: ${planFilename}\n---\n\n`
}

export function buildArgs(opts: {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
}): string[] {
  const args: string[] = [
    '--system-prompt', opts.systemPrompt,
    '--session-id', opts.sessionId,
    '--permission-mode', opts.permissionMode,
  ]
  if (opts.userContext.trim()) {
    args.push(opts.userContext.trim())
  }
  return args
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add lib/prompts.ts && git commit -m "feat: add audit phase and buildAuditPrompt to lib/prompts.ts"
```

---

### Task 8: `app/api/sessions/audit/route.ts` — spawn claude --print, write result

**Files:**
- Create: `app/api/sessions/audit/route.ts`

One-shot `child_process.spawn`. No PTY, no DB session. Reads plan + spec + memory, builds prompt, captures stdout, writes audit file with frontmatter.

- [ ] **Step 1: Create `app/api/sessions/audit/route.ts`**

```typescript
// app/api/sessions/audit/route.ts
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDb, getProject } from '@/lib/db'
import { resolveMemoryDir, listMemoryFiles } from '@/lib/memory'
import { buildAuditPrompt, buildFrontmatter } from '@/lib/prompts'

function resolveClaude(): string {
  const candidates = [
    `${os.homedir()}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return execSync('which claude', { encoding: 'utf8' }).trim()
}

export async function POST(req: Request) {
  const { projectId, planFile } = await req.json()
  if (!projectId || !planFile) {
    return NextResponse.json({ error: 'projectId and planFile required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const projectRoot = path.resolve(project.path)
  const absPlanFile = path.resolve(planFile)
  if (!absPlanFile.startsWith(projectRoot + path.sep)) {
    return NextResponse.json({ error: 'planFile must be within project' }, { status: 400 })
  }
  if (!fs.existsSync(absPlanFile)) {
    return NextResponse.json({ error: 'plan file not found' }, { status: 404 })
  }

  const planContent = fs.readFileSync(absPlanFile, 'utf8')
  const planFilename = path.basename(absPlanFile)
  const planBasename = path.basename(absPlanFile, '.md')

  // Try to find matching spec
  let specContent: string | null = null
  if (project.specs_dir) {
    const specPath = path.resolve(project.path, project.specs_dir, planFilename)
    if (fs.existsSync(specPath)) specContent = fs.readFileSync(specPath, 'utf8')
  }

  // Load memory
  let memoryContent: string | null = null
  const memoryDir = resolveMemoryDir(project.path)
  if (memoryDir) {
    const files = listMemoryFiles(memoryDir)
    if (files.length > 0) {
      memoryContent = files.map(f => `### [${f.type}] ${f.name}\n${f.content}`).join('\n\n---\n\n')
    }
  }

  const auditedAt = new Date().toISOString()
  const prompt = buildAuditPrompt({ planFilename, planContent, specContent, memoryContent })

  // Resolve output dir
  const plansDir = project.plans_dir ? path.resolve(project.path, project.plans_dir) : path.dirname(absPlanFile)
  const auditsDir = path.join(plansDir, 'audits')
  fs.mkdirSync(auditsDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const auditFile = path.join(auditsDir, `${planBasename}-audit-${dateStr}.md`)

  // Spawn claude --print
  const claudeBin = resolveClaude()
  const output = await new Promise<string>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(claudeBin, ['--print', '--output-format', 'text'], {
      cwd: project.path,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (!proc.stdin) return reject(new Error('claude stdin not available'))
    proc.stdin.write(prompt)
    proc.stdin.end()
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr}`))
      else resolve(stdout)
    })
    proc.on('error', reject)
  })

  const frontmatter = buildFrontmatter(output, auditedAt, planFilename)
  fs.writeFileSync(auditFile, frontmatter + output, 'utf8')

  return NextResponse.json({ ok: true, auditFile })
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/api/sessions/audit/route.ts && git commit -m "feat: add /api/sessions/audit POST — runs claude --print for plan audit"
```

---

### Task 9: `app/api/memory/audit-status/route.ts` — badge map

**Files:**
- Create: `app/api/memory/audit-status/route.ts`

Scans `{plans_dir}/audits/` for `*-audit-*.md` files, parses frontmatter, returns the most recent audit per plan basename.

- [ ] **Step 1: Create `app/api/memory/audit-status/route.ts`**

```typescript
// app/api/memory/audit-status/route.ts
import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import fs from 'fs'
import path from 'path'

type AuditStatus = {
  blockers: number
  warnings: number
  auditFile: string
  auditedAt: string
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return Object.fromEntries(
    match[1].split('\n')
      .map(l => l.match(/^(\w+):\s*(.+)$/))
      .filter(Boolean)
      .map(m => [m![1], m![2].trim()])
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const project = getProject(getDb(), projectId)
  if (!project || !project.plans_dir) return NextResponse.json({})

  const auditsDir = path.join(path.resolve(project.path, project.plans_dir), 'audits')
  if (!fs.existsSync(auditsDir)) return NextResponse.json({})

  const result: Record<string, AuditStatus> = {}

  const files = fs.readdirSync(auditsDir)
    .filter(f => f.endsWith('.md') && f.includes('-audit-'))
    .sort() // lexicographic = date order (YYYY-MM-DD suffix)

  for (const filename of files) {
    // filename: {planBasename}-audit-{YYYY-MM-DD}.md
    const match = filename.match(/^(.+)-audit-\d{4}-\d{2}-\d{2}\.md$/)
    if (!match) continue
    const planBasename = match[1]

    const filePath = path.join(auditsDir, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    const fm = parseFrontmatter(content)

    result[planBasename] = {
      blockers: parseInt(fm.blockers ?? '0', 10) || 0,
      warnings: parseInt(fm.warnings ?? '0', 10) || 0,
      auditFile: filePath,
      auditedAt: fm.audited_at ?? '',
    }
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/tomespen/git/project-control && git add app/api/memory/audit-status/route.ts && git commit -m "feat: add /api/memory/audit-status GET — returns badge map from audits dir"
```

---

### Task 10: Plans page — "Run Audit" button + audit badge

**Files:**
- Modify: `app/(dashboard)/plans/page.tsx`
- Create: `hooks/useAudit.ts`

Add `useAuditStatus` + `useRunAudit` hooks, wire up "Run Audit" action on each card, show colour-coded badge.

- [ ] **Step 1: Create `hooks/useAudit.ts`**

```typescript
// hooks/useAudit.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import path from 'path'

export type AuditStatus = {
  blockers: number
  warnings: number
  auditFile: string
  auditedAt: string
}

export function useAuditStatus(projectId: string | null) {
  return useQuery<Record<string, AuditStatus>>({
    queryKey: ['audit-status', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/memory/audit-status?projectId=${projectId}`)
      if (!r.ok) return {}
      return r.json()
    },
    enabled: !!projectId,
  })
}

export function useRunAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; planFile: string }) =>
      fetch('/api/sessions/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['audit-status', vars.projectId] })
    },
  })
}
```

Note: `path` is a Node built-in used server-side only — the hook uses `path.basename` via the API response's `auditFile`. Actually, avoid importing `path` in a client hook. The badge key lookup uses `path.basename(f.path, '.md')` which we can compute inline.

Correct version — no `path` import:

```typescript
// hooks/useAudit.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type AuditStatus = {
  blockers: number
  warnings: number
  auditFile: string
  auditedAt: string
}

export function useAuditStatus(projectId: string | null) {
  return useQuery<Record<string, AuditStatus>>({
    queryKey: ['audit-status', projectId],
    queryFn: async () => {
      const r = await fetch(`/api/memory/audit-status?projectId=${projectId}`)
      if (!r.ok) return {}
      return r.json()
    },
    enabled: !!projectId,
  })
}

export function useRunAudit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; planFile: string }) =>
      fetch('/api/sessions/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }).then(r => r.json()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['audit-status', vars.projectId] })
    },
  })
}
```

- [ ] **Step 2: Create `hooks/useAudit.ts`** with the corrected version above.

- [ ] **Step 3: Update `app/(dashboard)/plans/page.tsx`**

Replace the full file:

```typescript
// app/(dashboard)/plans/page.tsx
'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { PromptModal } from '@/components/PromptModal'
import { SessionModal } from '@/components/SessionModal'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession, type Session } from '@/hooks/useSessions'
import { useAuditStatus, useRunAudit } from '@/hooks/useAudit'
import { type Phase } from '@/lib/prompts'

function auditBadge(status: { blockers: number; warnings: number } | undefined, running: boolean) {
  if (running) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400 animate-pulse">Auditing…</span>
  if (!status) return null
  if (status.blockers > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">🔴 {status.blockers} blocker{status.blockers !== 1 ? 's' : ''}</span>
  if (status.warnings > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">🟡 {status.warnings} warning{status.warnings !== 1 ? 's' : ''}</span>
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">🟢 Ready</span>
}

export default function PlansPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, 'plans')
  const files = data ?? []
  const createFile = useCreateFile()
  const { data: auditStatuses = {} } = useAuditStatus(selectedProject?.id ?? null)
  const runAudit = useRunAudit()
  const [auditingFile, setAuditingFile] = useState<string | null>(null)
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [promptConfig, setPromptConfig] = useState<{ phase: Phase; sourceFile: string; fileTitle: string } | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const launchSession = useLaunchSession()

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view plans.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if (data === null || error) return <SetupPrompt dir="plans" />

  const handleAudit = async (f: MarkdownFile) => {
    if (auditingFile) return
    setAuditingFile(f.path)
    try {
      await runAudit.mutateAsync({ projectId: selectedProject.id, planFile: f.path })
    } finally {
      setAuditingFile(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">🗺 Plans</h1>
        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <button
              onClick={async () => {
                for (const f of files) await handleAudit(f)
              }}
              disabled={!!auditingFile}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50"
            >
              🔍 Audit All
            </button>
          )}
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
          >
            <Plus size={14} /> New Plan
          </button>
        </div>
      </div>

      {files.length === 0 && (
        <p className="text-zinc-600 text-sm">No plans yet. Create one or generate from a spec.</p>
      )}
      <CardGrid>
        {files.map((f) => {
          const basename = f.filename.replace(/\.md$/, '')
          const status = auditStatuses[basename]
          const isRunning = auditingFile === f.path
          return (
            <div key={f.path} className="flex flex-col">
              <MarkdownCard
                file={f}
                badge="plan"
                onClick={() => setDrawerFile(f)}
                actions={[
                  { label: '🗺 Continue Planning', variant: 'primary', onClick: () => setPromptConfig({ phase: 'plan', sourceFile: f.path, fileTitle: f.title }) },
                  { label: '🚀 Start Developing', onClick: () => setPromptConfig({ phase: 'develop', sourceFile: f.path, fileTitle: f.title }) },
                  { label: isRunning ? 'Auditing…' : '🔍 Audit', onClick: () => handleAudit(f) },
                ]}
              />
              {(status || isRunning) && (
                <div className="mt-1 flex justify-end">
                  {auditBadge(status, isRunning)}
                </div>
              )}
            </div>
          )
        })}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showNewDialog && (
        <NewFileDialog
          label="Plan"
          onCancel={() => setShowNewDialog(false)}
          onConfirm={async (name) => {
            try {
              await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'plans', name })
              setShowNewDialog(false)
            } catch {}
          }}
        />
      )}

      {promptConfig && selectedProject && (
        <PromptModal
          phase={promptConfig.phase}
          sourceFile={promptConfig.sourceFile}
          onCancel={() => setPromptConfig(null)}
          onLaunch={async (userContext, permissionMode) => {
            const config = promptConfig
            setPromptConfig(null)
            try {
              const result = await launchSession.mutateAsync({
                projectId: selectedProject.id,
                phase: config.phase,
                sourceFile: config.sourceFile,
                userContext,
                permissionMode,
              })
              if (result.sessionId) {
                setActiveSession({
                  id: result.sessionId,
                  label: `${config.fileTitle} · ${config.phase}`,
                  phase: config.phase,
                  project_id: selectedProject.id,
                  source_file: config.sourceFile,
                  status: 'active',
                  created_at: new Date().toISOString(),
                  ended_at: null,
                })
              }
            } catch {}
          }}
        />
      )}
      <SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
cd /home/tomespen/git/project-control && git add hooks/useAudit.ts app/\(dashboard\)/plans/page.tsx && git commit -m "feat: add audit badge and Run Audit action to plans page"
```

---

### Final verification

- [ ] Open http://localhost:3001/memory — select a project that has had Claude sessions. Memory files should appear grouped by type.
- [ ] Click a memory file — drawer opens with editable textarea, save button, delete button.
- [ ] Edit content, click Save — "Saved ✓" appears for 2s, file is updated on disk.
- [ ] Open Plans page — each plan card has "🔍 Audit" action.
- [ ] Click "🔍 Audit" — button shows "Auditing…", waits for claude --print to complete, badge appears below card.
- [ ] Badge shows 🔴/🟡/🟢 based on frontmatter counts in the written audit file.
