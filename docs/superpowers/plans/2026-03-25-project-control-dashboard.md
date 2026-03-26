# Project Control Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js 15 dashboard for managing Claude Code development workflows across multiple projects, with Ideas/Specs/Plans/Developing views and interactive Claude session terminals.

**Architecture:** Custom `server.ts` boots Next.js 15 and attaches a WebSocket endpoint on the same port. PTY instances live in `globalThis` maps (survives hot-reload). SQLite via `better-sqlite3` stores all project config and session state; markdown files live on disk and are read on demand.

**Tech Stack:** Next.js 15 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, TanStack Query v5, xterm.js 6 + @xterm/addon-fit, node-pty, ws, better-sqlite3, react-markdown + remark-gfm, Lucide React, Vitest + @testing-library/react

---

## File Map

```
project-control/
├── server.ts                          # Entry: boots Next.js + WebSocket server
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── .gitignore                         # includes /data/
├── data/                              # gitignored - runtime DB lives here
│   └── project-control.db
├── lib/
│   ├── db.ts                          # SQLite schema + all CRUD helpers
│   ├── session-manager.ts             # node-pty, globalThis maps, WS handler
│   ├── project-scanner.ts             # Scans ~/git for project folders
│   └── prompts.ts                     # System prompt templates per action type
├── app/
│   ├── layout.tsx                     # Root layout + TanStack Query provider
│   ├── page.tsx                       # Redirects to /ideas
│   ├── globals.css
│   ├── api/
│   │   ├── projects/
│   │   │   ├── route.ts               # GET: list all projects
│   │   │   ├── scan/
│   │   │   │   └── route.ts           # GET: scan ~/git for folders
│   │   │   └── [id]/
│   │   │       └── settings/
│   │   │           └── route.ts       # GET/POST: project folder settings
│   │   ├── files/
│   │   │   └── route.ts               # GET: list .md files; POST: create new .md
│   │   └── sessions/
│   │       ├── route.ts               # GET: list sessions; POST: spawn session
│   │       └── [id]/
│   │           └── route.ts           # DELETE: kill session
│   └── (dashboard)/
│       ├── layout.tsx                 # TopNav + project context
│       ├── ideas/page.tsx
│       ├── specs/page.tsx
│       ├── plans/page.tsx
│       └── developing/page.tsx
├── components/
│   ├── nav/
│   │   ├── TopNav.tsx                 # Header with tabs + project picker
│   │   └── ProjectPicker.tsx          # Dropdown: scans ~/git, shows configured projects
│   ├── cards/
│   │   ├── MarkdownCard.tsx           # Shared card for ideas/specs/plans
│   │   └── SessionCard.tsx            # Active session card with mini terminal preview
│   ├── CardGrid.tsx                   # 3-col responsive grid wrapper
│   ├── DevelopingView.tsx             # Cards/table toggle + session list
│   ├── SessionModal.tsx               # Full-screen xterm.js terminal overlay
│   ├── PromptModal.tsx                # Pre-launch action modal
│   ├── FileDrawer.tsx                 # Right sidebar: full rendered markdown
│   └── NewFileDialog.tsx              # Inline name prompt for + New button
├── hooks/
│   ├── useProjects.ts                 # TanStack Query hooks for projects API
│   ├── useSessions.ts                 # TanStack Query hooks for sessions API (polls 5s)
│   └── useFiles.ts                    # TanStack Query hooks for files API
└── __tests__/
    ├── lib/
    │   ├── db.test.ts
    │   ├── project-scanner.test.ts
    │   └── prompts.test.ts
    └── api/
        ├── projects.test.ts
        ├── files.test.ts
        └── sessions.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `server.ts`
- Create: `.gitignore`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Initialise Next.js app**

```bash
cd /home/tomespen/git/project-control
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --no-import-alias --turbopack
```

When prompted: accept all defaults (App Router, no `src/` dir).

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install better-sqlite3 node-pty ws react-markdown remark-gfm @xterm/xterm @xterm/addon-fit lucide-react @tanstack/react-query
```

- [ ] **Step 3: Install dev dependencies**

```bash
npm install -D @types/better-sqlite3 @types/node-pty @types/ws vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom tsx
```

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': '/home/tomespen/git/project-control' },
  },
})
```

Create `vitest.setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Write custom server**

Create `server.ts`:

```typescript
import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleWebSocket } from './lib/session-manager'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, turbo: dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', handleWebSocket)

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!)
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  // Kill all PTYs on shutdown
  const { ptyMap } = require('./lib/session-manager')
  const shutdown = () => {
    for (const proc of (ptyMap as Map<string, any>).values()) {
      try { proc.kill() } catch {}
    }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000')
  })
})
```

- [ ] **Step 6: Update package.json scripts**

Replace the `scripts` section in `package.json`:

```json
"scripts": {
  "dev": "tsx server.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server.ts",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 7: Update .gitignore**

Add to `.gitignore`:

```
/data/
.superpowers/
```

- [ ] **Step 8: Smoke test**

```bash
npm run dev
```

Expected: server starts on port 3000, Next.js default page loads at http://localhost:3000.

- [ ] **Step 9: Commit**

```bash
git init
git add -A
git commit -m "feat: project scaffold — Next.js 15, custom server, Vitest"
```

---

## Task 2: Database Layer

**Files:**
- Create: `lib/db.ts`
- Create: `__tests__/lib/db.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, createProject, getProject, updateProjectSettings, createSession, getActiveSessions, endSession } from '@/lib/db'
import Database from 'better-sqlite3'

let db: Database.Database

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('projects', () => {
  it('creates and retrieves a project', () => {
    const id = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    const project = getProject(db, id)
    expect(project?.name).toBe('my-app')
    expect(project?.path).toBe('/home/tom/git/my-app')
    expect(project?.ideas_dir).toBeNull()
  })

  it('updates project settings', () => {
    const id = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    updateProjectSettings(db, id, { ideas_dir: 'docs/ideas', specs_dir: 'docs/specs', plans_dir: 'docs/plans' })
    const project = getProject(db, id)
    expect(project?.ideas_dir).toBe('docs/ideas')
  })
})

describe('sessions', () => {
  it('creates an active session and retrieves it', () => {
    const projectId = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    createSession(db, {
      id: 'test-uuid',
      projectId,
      label: 'AI Auth · develop',
      phase: 'develop',
      sourceFile: '/home/tom/git/my-app/docs/ideas/ai-auth.md',
    })
    const sessions = getActiveSessions(db)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].label).toBe('AI Auth · develop')
    expect(sessions[0].status).toBe('active')
  })

  it('ends a session', () => {
    const projectId = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    createSession(db, { id: 'test-uuid', projectId, label: 'test', phase: 'develop', sourceFile: null })
    endSession(db, 'test-uuid')
    expect(getActiveSessions(db)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- __tests__/lib/db.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/db'`

- [ ] **Step 3: Implement db.ts**

Create `lib/db.ts`:

```typescript
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'

export type Project = {
  id: string
  name: string
  path: string
  ideas_dir: string | null
  specs_dir: string | null
  plans_dir: string | null
  created_at: string
}

export type Session = {
  id: string
  project_id: string
  label: string
  phase: string
  source_file: string | null
  status: string
  created_at: string
}

const DB_PATH = path.join(process.cwd(), 'data', 'project-control.db')

export function initDb(dbPath = DB_PATH): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      path       TEXT UNIQUE NOT NULL,
      ideas_dir  TEXT,
      specs_dir  TEXT,
      plans_dir  TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id),
      label       TEXT NOT NULL,
      phase       TEXT NOT NULL,
      source_file TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  return db
}

export function createProject(db: Database.Database, data: { name: string; path: string }): string {
  const id = randomUUID()
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, data.name, data.path, new Date().toISOString())
  return id
}

export function getProject(db: Database.Database, id: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project | undefined
}

export function listProjects(db: Database.Database): Project[] {
  return db.prepare(`SELECT * FROM projects ORDER BY name`).all() as Project[]
}

export function getProjectByPath(db: Database.Database, path: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE path = ?`).get(path) as Project | undefined
}

export function updateProjectSettings(
  db: Database.Database,
  id: string,
  settings: { ideas_dir?: string; specs_dir?: string; plans_dir?: string }
): void {
  db.prepare(`UPDATE projects SET ideas_dir = ?, specs_dir = ?, plans_dir = ? WHERE id = ?`)
    .run(settings.ideas_dir ?? null, settings.specs_dir ?? null, settings.plans_dir ?? null, id)
}

export function createSession(db: Database.Database, data: {
  id: string
  projectId: string
  label: string
  phase: string
  sourceFile: string | null
}): void {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(data.id, data.projectId, data.label, data.phase, data.sourceFile, new Date().toISOString())
}

export function getActiveSessions(db: Database.Database): Session[] {
  return db.prepare(`SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC`).all() as Session[]
}

export function getActiveSessionForFile(db: Database.Database, sourceFile: string): Session | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE source_file = ? AND status = 'active'`).get(sourceFile) as Session | undefined
}

export function endSession(db: Database.Database, id: string): void {
  db.prepare(`UPDATE sessions SET status = 'ended' WHERE id = ?`).run(id)
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) _db = initDb()
  return _db
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- __tests__/lib/db.test.ts
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts __tests__/lib/db.test.ts
git commit -m "feat: SQLite database layer with projects and sessions CRUD"
```

---

## Task 3: Project Scanner + Prompt Templates

**Files:**
- Create: `lib/project-scanner.ts`
- Create: `lib/prompts.ts`
- Create: `__tests__/lib/project-scanner.test.ts`
- Create: `__tests__/lib/prompts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/lib/project-scanner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { scanGitDir } from '@/lib/project-scanner'
import fs from 'fs'

vi.mock('fs')

describe('scanGitDir', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns folders found in ~/git', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readdirSync).mockReturnValue([
      { name: 'my-app', isDirectory: () => true } as any,
      { name: 'other-project', isDirectory: () => true } as any,
      { name: 'README.md', isDirectory: () => false } as any,
    ])
    const results = scanGitDir('/home/tom/git')
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('my-app')
    expect(results[0].path).toBe('/home/tom/git/my-app')
  })

  it('returns empty array if ~/git does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    expect(scanGitDir('/home/tom/git')).toEqual([])
  })
})
```

Create `__tests__/lib/prompts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getSystemPrompt, buildArgs } from '@/lib/prompts'

describe('getSystemPrompt', () => {
  it('returns a non-empty string for each action type', () => {
    const phases = ['brainstorm', 'spec', 'plan', 'develop', 'review'] as const
    for (const phase of phases) {
      const prompt = getSystemPrompt(phase, '/path/to/file.md')
      expect(prompt.length).toBeGreaterThan(20)
      expect(prompt).toContain('/path/to/file.md')
    }
  })
})

describe('buildArgs', () => {
  it('includes system prompt and user context', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: 'ctx', permissionMode: 'default', sessionId: 'abc' })
    expect(args).toContain('--system-prompt')
    expect(args).toContain('sys')
    expect(args).toContain('ctx')
    expect(args).toContain('--session-id')
    expect(args).toContain('abc')
  })

  it('omits user context when empty', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: '', permissionMode: 'default', sessionId: 'abc' })
    expect(args[args.length - 1]).not.toBe('')
    expect(args).not.toContain('')
  })

  it('sets correct permission-mode flag', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: '', permissionMode: 'bypassPermissions', sessionId: 'abc' })
    expect(args).toContain('bypassPermissions')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- __tests__/lib/project-scanner.test.ts __tests__/lib/prompts.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement project-scanner.ts**

Create `lib/project-scanner.ts`:

```typescript
import fs from 'fs'
import path from 'path'
import os from 'os'

export type ProjectFolder = { name: string; path: string }

export function getGitDir(): string {
  return path.join(os.homedir(), 'git')
}

export function scanGitDir(gitDir = getGitDir()): ProjectFolder[] {
  if (!fs.existsSync(gitDir)) return []
  return (fs.readdirSync(gitDir, { withFileTypes: true }) as fs.Dirent[])
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, path: path.join(gitDir, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 4: Implement prompts.ts**

Create `lib/prompts.ts`:

```typescript
export type Phase = 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review'
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
}

export function getSystemPrompt(phase: Phase, sourceFile: string): string {
  return TEMPLATES[phase](sourceFile)
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

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test -- __tests__/lib/project-scanner.test.ts __tests__/lib/prompts.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add lib/project-scanner.ts lib/prompts.ts __tests__/lib/project-scanner.test.ts __tests__/lib/prompts.test.ts
git commit -m "feat: project scanner and prompt templates"
```

---

## Task 4: Session Manager

**Files:**
- Create: `lib/session-manager.ts`

Note: node-pty is a native module — unit testing the PTY itself is impractical. This module is tested via manual integration (run `npm run dev` and launch a session). The WebSocket message handler logic is kept thin and testable by keeping PTY calls isolated.

- [ ] **Step 1: Resolve claude binary path helper**

Create `lib/session-manager.ts`:

```typescript
import * as pty from 'node-pty'
import { WebSocket } from 'ws'
import { execSync } from 'child_process'
import fs from 'fs'
import { getDb, createSession, endSession, getActiveSessionForFile } from './db'
import { buildArgs, getSystemPrompt, Phase, PermissionMode } from './prompts'
import { realpathSync } from 'fs'
import { randomUUID } from 'crypto'

// --- PTY maps (survive Next.js hot-reload via globalThis) ---
declare global {
  var ptyMap: Map<string, pty.IPty>
  var wsMap: Map<string, Set<WebSocket>>
  var outputBuffer: Map<string, string[]>
}
globalThis.ptyMap ??= new Map()
globalThis.wsMap ??= new Map()
globalThis.outputBuffer ??= new Map()

export const ptyMap = globalThis.ptyMap
export const wsMap = globalThis.wsMap
export const outputBuffer = globalThis.outputBuffer

// --- Claude binary resolution ---
function resolveClaude(): string {
  const candidates = [
    `${process.env.HOME}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('Claude binary not found. Install Claude Code: https://claude.ai/code')
  }
}

const CLAUDE_BIN = resolveClaude()

// --- Session spawning ---
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
}

export function spawnSession(opts: SpawnOptions): string {
  const db = getDb()
  const sessionId = randomUUID()

  // Block concurrent sessions on the same file
  if (opts.sourceFile) {
    const canonical = realpathSync(opts.sourceFile)
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  const systemPrompt = opts.sourceFile
    ? getSystemPrompt(opts.phase, opts.sourceFile)
    : `You are helping with a ${opts.phase} session.`

  const args = buildArgs({
    systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId,
  })

  const proc = pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: opts.projectPath,
    env: { ...process.env },
  })

  ptyMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())
  outputBuffer.set(sessionId, [])

  proc.onData((data) => {
    // Rolling 100-line buffer
    const buf = outputBuffer.get(sessionId) ?? []
    const lines = data.split('\n')
    buf.push(...lines)
    if (buf.length > 100) buf.splice(0, buf.length - 100)
    outputBuffer.set(sessionId, buf)

    // Broadcast to connected clients
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }))
      }
    }
  })

  proc.onExit(() => {
    endSession(getDb(), sessionId)
    ptyMap.delete(sessionId)
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'status', state: 'ended' }))
      }
    }
    wsMap.delete(sessionId)
  })

  const canonical = opts.sourceFile ? realpathSync(opts.sourceFile) : null
  createSession(db, {
    id: sessionId,
    projectId: opts.projectId,
    label: opts.label,
    phase: opts.phase,
    sourceFile: canonical,
  })

  return sessionId
}

export function killSession(sessionId: string): void {
  const proc = ptyMap.get(sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    ptyMap.delete(sessionId)
  }
  endSession(getDb(), sessionId)
}

export function isAlive(sessionId: string): boolean {
  return ptyMap.has(sessionId)
}

// --- WebSocket handler ---
export function handleWebSocket(ws: WebSocket): void {
  let attachedSessionId: string | null = null

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'attach') {
        const { sessionId } = msg
        attachedSessionId = sessionId

        // Send buffered output as replay
        const buf = outputBuffer.get(sessionId) ?? []
        if (buf.length > 0) {
          ws.send(JSON.stringify({ type: 'output', data: buf.join('\n') }))
        }

        // Register client
        if (!wsMap.has(sessionId)) wsMap.set(sessionId, new Set())
        wsMap.get(sessionId)!.add(ws)

        // Send current status
        const alive = ptyMap.has(sessionId)
        ws.send(JSON.stringify({ type: 'status', state: alive ? 'active' : 'ended' }))
      }

      if (msg.type === 'input' && attachedSessionId) {
        ptyMap.get(attachedSessionId)?.write(msg.data)
      }

      if (msg.type === 'resize' && attachedSessionId) {
        ptyMap.get(attachedSessionId)?.resize(msg.cols, msg.rows)
      }
    } catch {}
  })

  ws.on('close', () => {
    if (attachedSessionId) {
      wsMap.get(attachedSessionId)?.delete(ws)
    }
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (or only minor missing-type warnings — fix any errors)

- [ ] **Step 3: Commit**

```bash
git add lib/session-manager.ts
git commit -m "feat: session manager — node-pty spawning, WebSocket handler, output buffer"
```

---

## Task 5: API Routes

**Files:**
- Create: `app/api/projects/route.ts`
- Create: `app/api/projects/scan/route.ts`
- Create: `app/api/projects/[id]/settings/route.ts`
- Create: `app/api/files/route.ts`
- Create: `app/api/sessions/route.ts`
- Create: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Projects list route**

Create `app/api/projects/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb, listProjects, createProject, getProjectByPath } from '@/lib/db'

export function GET() {
  const projects = listProjects(getDb())
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const { name, path } = await req.json()
  if (!name || !path) return NextResponse.json({ error: 'name and path required' }, { status: 400 })
  const db = getDb()
  const existing = getProjectByPath(db, path)
  if (existing) return NextResponse.json(existing)
  const id = createProject(db, { name, path })
  return NextResponse.json({ id })
}
```

- [ ] **Step 2: Scan route**

Create `app/api/projects/scan/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { scanGitDir } from '@/lib/project-scanner'

export function GET() {
  return NextResponse.json(scanGitDir())
}
```

- [ ] **Step 3: Project settings route**

Create `app/api/projects/[id]/settings/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb, getProject, updateProjectSettings } from '@/lib/db'

export function GET(_req: Request, { params }: { params: { id: string } }) {
  const project = getProject(getDb(), params.id)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json()
  updateProjectSettings(getDb(), params.id, body)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Files route**

Create `app/api/files/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import fs from 'fs'
import path from 'path'

type Dir = 'ideas' | 'specs' | 'plans'
const DIR_MAP: Record<Dir, keyof ReturnType<typeof getProject>> = {
  ideas: 'ideas_dir',
  specs: 'specs_dir',
  plans: 'plans_dir',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const dir = searchParams.get('dir') as Dir

  if (!projectId || !dir || !DIR_MAP[dir]) {
    return NextResponse.json({ error: 'projectId and dir required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const relDir = project[DIR_MAP[dir]] as string | null
  if (!relDir) return NextResponse.json({ error: `${dir}_dir not configured` }, { status: 422 })

  const absDir = path.join(project.path, relDir)
  if (!fs.existsSync(absDir)) return NextResponse.json([])

  const files = fs.readdirSync(absDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const filePath = path.join(absDir, f)
      const content = fs.readFileSync(filePath, 'utf8')
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const excerptMatch = content.split('\n').find((l) => l.trim() && !l.startsWith('#'))
      const stat = fs.statSync(filePath)
      return {
        filename: f,
        path: filePath,
        title: titleMatch?.[1] ?? f.replace('.md', ''),
        excerpt: excerptMatch?.trim() ?? '',
        modifiedAt: stat.mtime.toISOString(),
        content,
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  return NextResponse.json(files)
}

export async function POST(req: Request) {
  const { projectId, dir, name } = await req.json()
  if (!projectId || !dir || !name) {
    return NextResponse.json({ error: 'projectId, dir, and name required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const relDir = project[DIR_MAP[dir as Dir]] as string | null
  if (!relDir) return NextResponse.json({ error: `${dir}_dir not configured` }, { status: 422 })

  const absDir = path.join(project.path, relDir)
  fs.mkdirSync(absDir, { recursive: true })

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  let filename = `${slug}.md`
  let counter = 2
  while (fs.existsSync(path.join(absDir, filename))) {
    filename = `${slug}-${counter++}.md`
  }

  const filePath = path.join(absDir, filename)
  fs.writeFileSync(filePath, `# ${name}\n\n`)

  return NextResponse.json({ filename, path: filePath })
}
```

- [ ] **Step 5: Sessions route**

Create `app/api/sessions/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getDb, getActiveSessions, getProject } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'

export function GET() {
  return NextResponse.json(getActiveSessions(getDb()))
}

export async function POST(req: Request) {
  const body = await req.json()
  const { projectId, phase, sourceFile, userContext = '', permissionMode = 'default' } = body

  if (!projectId || !phase) {
    return NextResponse.json({ error: 'projectId and phase required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  try {
    const label = sourceFile
      ? `${path.basename(sourceFile, '.md')} · ${phase}`
      : phase

    const sessionId = spawnSession({
      projectId,
      projectPath: project.path,
      label,
      phase,
      sourceFile: sourceFile ?? null,
      userContext,
      permissionMode,
    })

    return NextResponse.json({ sessionId })
  } catch (err: any) {
    if (err.message?.startsWith('CONCURRENT_SESSION:')) {
      const existingId = err.message.split(':')[1]
      return NextResponse.json({ error: 'concurrent_session', sessionId: existingId }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

Note: ensure `import path from 'path'` is at the top of the file, not after the exported functions.

- [ ] **Step 6: Session delete route**

Create `app/api/sessions/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { killSession } from '@/lib/session-manager'

export function DELETE(_req: Request, { params }: { params: { id: string } }) {
  killSession(params.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before continuing.

- [ ] **Step 8: Commit**

```bash
git add app/api/
git commit -m "feat: API routes — projects, files, sessions"
```

---

## Task 6: Core UI — Layout, Nav, TanStack Query

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/ideas/page.tsx`
- Create: `app/(dashboard)/specs/page.tsx`
- Create: `app/(dashboard)/plans/page.tsx`
- Create: `app/(dashboard)/developing/page.tsx`
- Create: `components/nav/TopNav.tsx`
- Create: `components/nav/ProjectPicker.tsx`
- Create: `hooks/useProjects.ts`

- [ ] **Step 1: Root layout with TanStack Query provider**

Replace `app/layout.tsx`:

```tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import './globals.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }))
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </body>
    </html>
  )
}
```

Note: Root layout cannot export metadata when marked `'use client'` — remove the default metadata export from `layout.tsx` if present.

- [ ] **Step 2: Projects hook**

Create `hooks/useProjects.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type Project = {
  id: string; name: string; path: string
  ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null
}

export type ScannedFolder = { name: string; path: string }

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => fetch('/api/projects').then((r) => r.json()),
  })
}

export function useScanFolders() {
  return useQuery<ScannedFolder[]>({
    queryKey: ['scan'],
    queryFn: () => fetch('/api/projects/scan').then((r) => r.json()),
  })
}

export function useAddProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; path: string }) =>
      fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Record<string, string> }) =>
      fetch(`/api/projects/${id}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
```

- [ ] **Step 3: ProjectPicker component**

Create `components/nav/ProjectPicker.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { ChevronDown, FolderOpen, Plus } from 'lucide-react'
import { useProjects, useScanFolders, useAddProject, type Project } from '@/hooks/useProjects'

type Props = {
  selected: Project | null
  onSelect: (p: Project) => void
}

export function ProjectPicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const { data: projects = [] } = useProjects()
  const { data: scanned = [] } = useScanFolders()
  const addProject = useAddProject()

  const unregistered = scanned.filter((f) => !projects.find((p) => p.path === f.path))

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-200"
      >
        <FolderOpen size={14} />
        {selected?.name ?? 'Select project'}
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
          {projects.length > 0 && (
            <div className="p-1">
              <p className="px-2 py-1 text-xs text-zinc-500 uppercase tracking-wider">Projects</p>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false) }}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {unregistered.length > 0 && (
            <div className="border-t border-zinc-800 p-1">
              <p className="px-2 py-1 text-xs text-zinc-500 uppercase tracking-wider">Add from ~/git</p>
              {unregistered.map((f) => (
                <button
                  key={f.path}
                  onClick={async () => {
                    const result = await addProject.mutateAsync({ name: f.name, path: f.path })
                    if (result.id) onSelect({ ...f, id: result.id, ideas_dir: null, specs_dir: null, plans_dir: null })
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 rounded text-sm text-zinc-400 hover:bg-zinc-800 flex items-center gap-2"
                >
                  <Plus size={12} /> {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: TopNav component**

Create `components/nav/TopNav.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings } from 'lucide-react'
import { ProjectPicker } from './ProjectPicker'
import { useProjectStore } from '@/hooks/useProjects'

const TABS = [
  { label: 'Ideas', href: '/ideas' },
  { label: 'Specs', href: '/specs' },
  { label: 'Plans', href: '/plans' },
  { label: 'Developing', href: '/developing' },
]

export function TopNav() {
  const pathname = usePathname()
  const { selectedProject, setSelectedProject } = useProjectStore()

  return (
    <header className="h-12 flex items-center gap-4 px-4 border-b border-zinc-800 bg-zinc-950">
      <span className="font-bold text-violet-400 text-sm">⬡ Project Control</span>
      <ProjectPicker selected={selectedProject} onSelect={setSelectedProject} />
      <nav className="flex gap-1 ml-4">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              pathname.startsWith(t.href)
                ? 'bg-violet-500/20 text-violet-300'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto">
        <Link href="/settings" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
          <Settings size={16} />
        </Link>
      </div>
    </header>
  )
}
```

Add `useProjectStore` to `hooks/useProjects.ts` (simple in-memory state for selected project — use `useState` lifted to a React context rather than a separate store to avoid adding Zustand as a dependency):

```typescript
// Add to hooks/useProjects.ts
import { createContext, useContext, useState, type ReactNode } from 'react'

type ProjectContextType = {
  selectedProject: Project | null
  setSelectedProject: (p: Project) => void
}

const ProjectContext = createContext<ProjectContextType>({
  selectedProject: null,
  setSelectedProject: () => {},
})

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  return (
    <ProjectContext.Provider value={{ selectedProject, setSelectedProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProjectStore() {
  return useContext(ProjectContext)
}
```

Wrap `app/layout.tsx` children with `<ProjectProvider>`.

- [ ] **Step 5: Dashboard layout**

Create `app/(dashboard)/layout.tsx`:

```tsx
import { TopNav } from '@/components/nav/TopNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <TopNav />
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 6: Stub page files**

Create `app/(dashboard)/ideas/page.tsx`:

```tsx
export default function IdeasPage() {
  return <div className="text-zinc-400">Ideas view — coming in Task 7</div>
}
```

Repeat for `specs/page.tsx`, `plans/page.tsx`, `developing/page.tsx` with matching placeholders.

Create `app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
export default function Home() { redirect('/ideas') }
```

- [ ] **Step 7: Visual smoke test**

```bash
npm run dev
```

Open http://localhost:3000 — verify redirect to /ideas, nav renders, project picker opens and lists ~/git folders.

- [ ] **Step 8: Commit**

```bash
git add app/ components/nav/ hooks/useProjects.ts
git commit -m "feat: core UI layout, TopNav, ProjectPicker, TanStack Query setup"
```

---

## Task 7: Ideas / Specs / Plans Views

**Files:**
- Create: `hooks/useFiles.ts`
- Create: `components/cards/MarkdownCard.tsx`
- Create: `components/CardGrid.tsx`
- Create: `components/FileDrawer.tsx`
- Create: `components/NewFileDialog.tsx`
- Modify: `app/(dashboard)/ideas/page.tsx`
- Modify: `app/(dashboard)/specs/page.tsx`
- Modify: `app/(dashboard)/plans/page.tsx`

- [ ] **Step 1: Files hook**

Create `hooks/useFiles.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type MarkdownFile = {
  filename: string
  path: string
  title: string
  excerpt: string
  modifiedAt: string
  content: string
}

export function useFiles(projectId: string | null, dir: 'ideas' | 'specs' | 'plans') {
  return useQuery<MarkdownFile[]>({
    queryKey: ['files', projectId, dir],
    queryFn: () => fetch(`/api/files?projectId=${projectId}&dir=${dir}`).then((r) => r.json()),
    enabled: !!projectId,
  })
}

export function useCreateFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { projectId: string; dir: string; name: string }) =>
      fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['files', vars.projectId, vars.dir] }),
  })
}
```

- [ ] **Step 2: FileDrawer**

Create `components/FileDrawer.tsx`:

```tsx
'use client'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X } from 'lucide-react'
import type { MarkdownFile } from '@/hooks/useFiles'

type Props = {
  file: MarkdownFile | null
  onClose: () => void
}

export function FileDrawer({ file, onClose }: Props) {
  if (!file) return null
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[600px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="font-semibold text-zinc-100 truncate">{file.title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.content}</ReactMarkdown>
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 3: NewFileDialog**

Create `components/NewFileDialog.tsx`:

```tsx
'use client'
import { useState } from 'react'

type Props = {
  onConfirm: (name: string) => void
  onCancel: () => void
  label: string
}

export function NewFileDialog({ onConfirm, onCancel, label }: Props) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-80 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">New {label}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); if (e.key === 'Escape') onCancel() }}
          placeholder={`${label} name...`}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: MarkdownCard**

Create `components/cards/MarkdownCard.tsx`:

```tsx
'use client'
import { formatDistanceToNow } from 'date-fns'
import type { MarkdownFile } from '@/hooks/useFiles'

type Action = { label: string; onClick: () => void; variant?: 'primary' | 'default' }

type Props = {
  file: MarkdownFile
  badge: string
  actions: Action[]
  onClick: () => void
}

export function MarkdownCard({ file, badge, actions, onClick }: Props) {
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
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex items-center gap-2">
        {actions.map((a) => (
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
        ))}
      </div>
    </div>
  )
}
```

Install `date-fns`:

```bash
npm install date-fns
```

- [ ] **Step 5: CardGrid**

Create `components/CardGrid.tsx`:

```tsx
type Props = { children: React.ReactNode }

export function CardGrid({ children }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 6: Ideas page**

Replace `app/(dashboard)/ideas/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'

export default function IdeasPage() {
  const { selectedProject } = useProjectStore()
  const { data: files = [], isLoading, error } = useFiles(selectedProject?.id ?? null, 'ideas')
  const createFile = useCreateFile()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view ideas.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if ((error as any)?.message?.includes('not configured')) {
    return <p className="text-zinc-500 text-sm">Ideas folder not configured. Go to Settings to set it up.</p>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">💡 Ideas</h1>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Plus size={14} /> New Idea
        </button>
      </div>

      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="idea"
            onClick={() => setDrawerFile(f)}
            actions={[
              { label: '💬 Brainstorm', variant: 'primary', onClick: () => { /* Task 9 */ } },
              { label: '📋 Create Spec', onClick: () => { /* Task 9 */ } },
              { label: '🚀 Develop', onClick: () => { /* Task 9 */ } },
            ]}
          />
        ))}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showNewDialog && (
        <NewFileDialog
          label="Idea"
          onCancel={() => setShowNewDialog(false)}
          onConfirm={async (name) => {
            setShowNewDialog(false)
            await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'ideas', name })
          }}
        />
      )}
    </>
  )
}
```

Repeat for `specs/page.tsx` (badge `spec`, actions `📋 Continue Spec`, `🗺 Create Plan`) and `plans/page.tsx` (badge `plan`, actions `🗺 Continue Planning`, `🚀 Start Developing`).

- [ ] **Step 7: Visual smoke test**

```bash
npm run dev
```

Select a project, configure the ideas folder in project settings (patch directly in the DB if the settings UI isn't built yet: `sqlite3 data/project-control.db "UPDATE projects SET ideas_dir='docs/ideas' WHERE name='my-app'"`). Verify cards render, drawer opens.

- [ ] **Step 8: Commit**

```bash
git add hooks/useFiles.ts components/ app/(dashboard)/
git commit -m "feat: Ideas/Specs/Plans views with cards, FileDrawer, NewFileDialog"
```

---

## Task 8: Sessions Hook + Currently Developing View

**Files:**
- Create: `hooks/useSessions.ts`
- Create: `components/cards/SessionCard.tsx`
- Create: `components/DevelopingView.tsx`
- Modify: `app/(dashboard)/developing/page.tsx`

- [ ] **Step 1: Sessions hook**

Create `hooks/useSessions.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type Session = {
  id: string
  project_id: string
  label: string
  phase: string
  source_file: string | null
  status: string
  created_at: string
}

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/sessions').then((r) => r.json()),
    refetchInterval: 5000,
  })
}

export function useKillSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}
```

- [ ] **Step 2: SessionCard**

Create `components/cards/SessionCard.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'

type Props = {
  session: Session
  onOpen: () => void
  onStop: () => void
}

export function SessionCard({ session, onOpen, onStop }: Props) {
  const [preview, setPreview] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'output') {
        setPreview((prev) => {
          const lines = (prev + msg.data).split('\n')
          return lines.slice(-3).join('\n')
        })
      }
    }
    return () => ws.close()
  }, [session.id])

  return (
    <div className="bg-zinc-900 border border-emerald-500/30 rounded-lg overflow-hidden flex flex-col">
      <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
        <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">Active</span>
        <span className="ml-auto text-zinc-500 text-xs">{formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}</span>
      </div>
      <div className="p-4 flex-1">
        <p className="text-sm font-semibold text-zinc-100 mb-1">{session.label}</p>
        <p className="text-xs text-zinc-500 mb-3 capitalize">{session.phase}</p>
        <div className="bg-zinc-950 rounded p-2 h-10 overflow-hidden font-mono text-[10px] text-emerald-400 leading-relaxed">
          {preview || <span className="text-zinc-600">Waiting for output...</span>}
        </div>
      </div>
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex gap-2">
        <button onClick={onOpen} className="text-xs px-2.5 py-1 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 rounded">Open →</button>
        <button onClick={onStop} className="text-xs px-2.5 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded flex items-center gap-1"><Square size={10} /> Stop</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: DevelopingView**

Create `components/DevelopingView.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { CardGrid } from './CardGrid'
import { SessionCard } from './cards/SessionCard'
import { useSessions, useKillSession, type Session } from '@/hooks/useSessions'

type Props = {
  onOpenSession: (s: Session) => void
}

export function DevelopingView({ onOpenSession }: Props) {
  const { data: sessions = [], isLoading } = useSessions()
  const killSession = useKillSession()
  const [view, setView] = useState<'cards' | 'table'>('cards')

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading sessions...</p>
  if (sessions.length === 0) return <p className="text-zinc-500 text-sm">No active sessions.</p>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">⚡ Developing</h1>
        <div className="flex gap-1">
          <button onClick={() => setView('cards')} className={`p-1.5 rounded ${view === 'cards' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><List size={16} /></button>
        </div>
      </div>

      {view === 'cards' ? (
        <CardGrid>
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onOpen={() => onOpenSession(s)} onStop={() => killSession.mutate(s.id)} />
          ))}
        </CardGrid>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Phase</th>
              <th className="pb-2 pr-4">Started</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-zinc-900">
                <td className="py-2 pr-4 text-zinc-200">{s.label}</td>
                <td className="py-2 pr-4 text-zinc-400 capitalize">{s.phase}</td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</td>
                <td className="py-2 flex gap-2">
                  <button onClick={() => onOpenSession(s)} className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded">Open</button>
                  <button onClick={() => killSession.mutate(s.id)} className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 rounded">Stop</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
```

Add `import { formatDistanceToNow } from 'date-fns'` to the component.

- [ ] **Step 4: Developing page**

Replace `app/(dashboard)/developing/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { DevelopingView } from '@/components/DevelopingView'
import { SessionModal } from '@/components/SessionModal'
import type { Session } from '@/hooks/useSessions'

export default function DevelopingPage() {
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  return (
    <>
      <DevelopingView onOpenSession={setActiveSession} />
      <SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
    </>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add hooks/useSessions.ts components/cards/SessionCard.tsx components/DevelopingView.tsx app/(dashboard)/developing/page.tsx
git commit -m "feat: Currently Developing view with card/table toggle and live mini preview"
```

---

## Task 9: Session Modal (xterm.js)

**Files:**
- Create: `components/SessionModal.tsx`

- [ ] **Step 1: Install xterm CSS**

Confirm `@xterm/xterm` and `@xterm/addon-fit` are installed (done in Task 1). Import the xterm CSS in `app/globals.css`:

```css
@import '@xterm/xterm/css/xterm.css';
```

- [ ] **Step 2: Implement SessionModal**

Create `components/SessionModal.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'

type Props = {
  session: Session | null
  onClose: () => void
}

export function SessionModal({ session, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<'active' | 'ended' | 'connecting'>('connecting')
  const killSession = useKillSession()

  useEffect(() => {
    if (!session || !containerRef.current) return

    let term: any
    let ws: WebSocket

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#a78bfa' },
        fontSize: 13,
        fontFamily: 'ui-monospace, monospace',
        cursorBlink: true,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current!)

      // Wait one frame for layout
      await new Promise((r) => requestAnimationFrame(r))
      fit.fit()
      termRef.current = term

      ws = new WebSocket(`ws://${window.location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') term.write(msg.data)
        if (msg.type === 'status') setStatus(msg.state)
      }

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      })

      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(containerRef.current!)
    }

    setStatus('connecting')
    init()

    return () => {
      ws?.close()
      term?.dispose()
    }
  }, [session?.id])

  if (!session) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-400' : status === 'ended' ? 'bg-zinc-600' : 'bg-yellow-400'}`} />
        <span className="text-sm font-medium text-zinc-200">{session.label}</span>
        <span className="text-xs text-zinc-500 capitalize">{status}</span>
        <div className="ml-auto flex gap-2">
          {status === 'active' && (
            <button onClick={() => killSession.mutate(session.id)} className="flex items-center gap-1.5 text-xs px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded">
              <Square size={12} /> Stop Session
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800"><X size={18} /></button>
        </div>
      </div>

      {status === 'ended' && (
        <div className="bg-zinc-800/50 text-zinc-400 text-xs text-center py-2">
          Session ended — output above is read-only
        </div>
      )}

      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  )
}
```

- [ ] **Step 3: Wire SessionModal into ideas/specs/plans pages**

The modal is already used in `developing/page.tsx`. For the other pages, add it alongside the card grid. In `ideas/page.tsx`, add state and open the modal from the Brainstorm/Develop action buttons (leave as `alert('Coming in Task 10')` until PromptModal is built).

- [ ] **Step 4: Visual test**

Launch a session manually via `curl`:

```bash
# First get a project ID
curl http://localhost:3000/api/projects

# Launch a session (replace PROJECT_ID and SOURCE_FILE)
curl -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"PROJECT_ID","phase":"develop","sourceFile":null,"userContext":"echo hello world"}'
```

Open the Developing view, click "Open →" on the session card. Verify the xterm terminal renders and shows output.

- [ ] **Step 5: Commit**

```bash
git add components/SessionModal.tsx app/globals.css
git commit -m "feat: SessionModal with xterm.js, WebSocket attach, live PTY I/O"
```

---

## Task 10: Prompt Modal + Action Wiring

**Files:**
- Create: `components/PromptModal.tsx`
- Modify: `app/(dashboard)/ideas/page.tsx`
- Modify: `app/(dashboard)/specs/page.tsx`
- Modify: `app/(dashboard)/plans/page.tsx`

- [ ] **Step 1: Implement PromptModal**

Create `components/PromptModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { getSystemPrompt, type Phase } from '@/lib/prompts'

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions'

type Props = {
  phase: Phase
  sourceFile: string
  onLaunch: (userContext: string, permissionMode: PermissionMode) => void
  onCancel: () => void
}

const ACTION_LABELS: Record<Phase, string> = {
  brainstorm: '💬 Brainstorm',
  spec: '📋 Create Spec',
  plan: '🗺 Create Plan',
  develop: '🚀 Start Developing',
  review: '🔍 Review',
}

export function PromptModal({ phase, sourceFile, onLaunch, onCancel }: Props) {
  const [userContext, setUserContext] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const systemPrompt = getSystemPrompt(phase, sourceFile)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-sm font-semibold text-zinc-100 mb-1">{ACTION_LABELS[phase]}</h2>
        <p className="text-xs text-zinc-500 mb-4 truncate">{sourceFile.split('/').pop()}</p>

        {/* System prompt toggle */}
        <button
          onClick={() => setShowSystemPrompt((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-2"
        >
          {showSystemPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Show system prompt
        </button>
        {showSystemPrompt && (
          <div className="bg-zinc-950 rounded p-3 text-xs text-zinc-500 mb-3 max-h-32 overflow-y-auto font-mono leading-relaxed">
            {systemPrompt}
          </div>
        )}

        {/* User context */}
        <label className="block text-xs text-zinc-400 mb-1.5">
          Add your context <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          value={userContext}
          onChange={(e) => setUserContext(e.target.value)}
          placeholder="Any specific focus, constraints, or instructions..."
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500 resize-none mb-4"
        />

        {/* Permission mode (develop only) */}
        {phase === 'develop' && (
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1.5">Permission level</label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            >
              <option value="default">Ask for each tool (default)</option>
              <option value="acceptEdits">Auto-accept file edits</option>
              <option value="bypassPermissions">Bypass all prompts ⚠️</option>
            </select>
            {permissionMode === 'bypassPermissions' && (
              <p className="flex items-center gap-1 text-xs text-amber-400 mt-1.5">
                <AlertTriangle size={12} /> All tool permissions will be bypassed automatically.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button
            onClick={() => onLaunch(userContext, permissionMode)}
            className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
          >
            Launch Session →
          </button>
        </div>
      </div>
    </div>
  )
}
```

Note: `getSystemPrompt` is a pure function in `lib/prompts.ts` — safe to import directly in a client component since it has no Node.js dependencies.

- [ ] **Step 2: Session launch mutation**

Add to `hooks/useSessions.ts`:

```typescript
export function useLaunchSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      projectId: string
      phase: string
      sourceFile: string | null
      userContext?: string
      permissionMode?: string
    }) =>
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
}
```

- [ ] **Step 3: Wire actions in ideas/page.tsx**

Update `app/(dashboard)/ideas/page.tsx` to add PromptModal state and wire action buttons:

```tsx
// Add to component state:
const [promptConfig, setPromptConfig] = useState<{ phase: Phase; sourceFile: string; fileTitle: string } | null>(null)
const launchSession = useLaunchSession()
const [activeSession, setActiveSession] = useState<any>(null)

// Replace action onClick stubs:
actions={[
  { label: '💬 Brainstorm', variant: 'primary', onClick: () => setPromptConfig({ phase: 'brainstorm', sourceFile: f.path, fileTitle: f.title }) },
  { label: '📋 Create Spec', onClick: () => setPromptConfig({ phase: 'spec', sourceFile: f.path, fileTitle: f.title }) },
  { label: '🚀 Develop', onClick: () => setPromptConfig({ phase: 'develop', sourceFile: f.path, fileTitle: f.title }) },
]}

// Add after CardGrid:
{promptConfig && selectedProject && (
  <PromptModal
    phase={promptConfig.phase}
    sourceFile={promptConfig.sourceFile}
    onCancel={() => setPromptConfig(null)}
    onLaunch={async (userContext, permissionMode) => {
      setPromptConfig(null)
      const result = await launchSession.mutateAsync({
        projectId: selectedProject.id,
        phase: promptConfig.phase,
        sourceFile: promptConfig.sourceFile,
        userContext,
        permissionMode,
      })
      if (result.sessionId) setActiveSession({ id: result.sessionId, label: `${promptConfig.fileTitle} · ${promptConfig.phase}`, phase: promptConfig.phase, created_at: new Date().toISOString() })
    }}
  />
)}

<SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
```

Repeat the same pattern for `specs/page.tsx` and `plans/page.tsx` with their respective action types.

- [ ] **Step 4: End-to-end test**

```bash
npm run dev
```

1. Select a project with ideas folder configured and at least one .md file
2. Click "💬 Brainstorm" on a card
3. Verify PromptModal appears with system prompt toggle and context textarea
4. Add optional context, click "Launch Session →"
5. Verify SessionModal opens with live terminal output from Claude

- [ ] **Step 5: Commit**

```bash
git add components/PromptModal.tsx hooks/useSessions.ts app/(dashboard)/
git commit -m "feat: PromptModal with system prompt preview and action wiring"
```

---

## Task 11: Project Settings Page

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Settings page**

Create `app/(dashboard)/settings/page.tsx`:

```tsx
'use client'
import { useState, useEffect } from 'react'
import { useProjectStore, useUpdateSettings } from '@/hooks/useProjects'

export default function SettingsPage() {
  const { selectedProject } = useProjectStore()
  const updateSettings = useUpdateSettings()
  const [form, setForm] = useState({ ideas_dir: '', specs_dir: '', plans_dir: '' })

  useEffect(() => {
    if (selectedProject) {
      setForm({
        ideas_dir: selectedProject.ideas_dir ?? '',
        specs_dir: selectedProject.specs_dir ?? '',
        plans_dir: selectedProject.plans_dir ?? '',
      })
    }
  }, [selectedProject])

  if (!selectedProject) return <p className="text-zinc-500 text-sm">Select a project to configure.</p>

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-zinc-100 mb-6">⚙ Settings — {selectedProject.name}</h1>
      <div className="space-y-4">
        {(['ideas_dir', 'specs_dir', 'plans_dir'] as const).map((field) => (
          <div key={field}>
            <label className="block text-xs text-zinc-400 mb-1.5 capitalize">{field.replace('_dir', '')} folder <span className="text-zinc-600">(relative to project root)</span></label>
            <input
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              placeholder={`e.g. docs/${field.replace('_dir', '')}`}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
            />
          </div>
        ))}
        <button
          onClick={() => updateSettings.mutate({ id: selectedProject.id, settings: form })}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded"
        >
          {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      <p className="mt-4 text-xs text-zinc-600">Project path: {selectedProject.path}</p>
    </div>
  )
}
```

Add Settings to the nav tabs in `TopNav.tsx`:

```tsx
// The Settings link is already in the nav as an icon — this is sufficient.
// Optionally add a 'Settings' tab entry if desired.
```

- [ ] **Step 2: Visual test**

Navigate to /settings, select a project, fill in folder paths, save. Verify the Ideas view now shows cards from the configured folder.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/settings/
git commit -m "feat: project settings page — configure ideas/specs/plans folders"
```

---

## Task 12: Claude Binary Not Found + Error States

**Files:**
- Create: `components/ClaudeNotFound.tsx`
- Modify: `lib/session-manager.ts`

- [ ] **Step 1: Surface binary error in UI**

Create `components/ClaudeNotFound.tsx`:

```tsx
export function ClaudeNotFound() {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
      <strong>Claude Code not found.</strong> Install it from{' '}
      <a href="https://claude.ai/code" className="underline" target="_blank" rel="noreferrer">claude.ai/code</a>
      {' '}and restart the dashboard.
    </div>
  )
}
```

Wrap the `CLAUDE_BIN` resolution in `session-manager.ts` so it returns `null` instead of throwing at module load, and expose an `isClaudeAvailable()` helper:

```typescript
let CLAUDE_BIN: string | null = null
try { CLAUDE_BIN = resolveClaude() } catch {}

export function isClaudeAvailable(): boolean { return CLAUDE_BIN !== null }
```

Create `app/api/sessions/health/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { isClaudeAvailable } from '@/lib/session-manager'

export function GET() {
  return NextResponse.json({ claudeAvailable: isClaudeAvailable() })
}
```

Check this in `app/(dashboard)/layout.tsx` on mount and render `<ClaudeNotFound />` as a banner below the `<TopNav />` if `claudeAvailable` is false.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Final smoke test**

```bash
npm run dev
```

Walk through the full flow:
1. Open http://localhost:3000
2. Select a project, configure folders in Settings
3. View Ideas — cards load
4. Click a card body — FileDrawer opens with rendered markdown
5. Click an action button — PromptModal appears
6. Launch a session — SessionModal opens with live Claude terminal
7. Open Developing view — session card with mini preview + card/table toggle
8. Stop the session

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: project control dashboard — complete implementation"
```
