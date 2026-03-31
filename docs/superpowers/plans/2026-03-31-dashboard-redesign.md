# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project landing redirect with a live Dashboard showing active Claude sessions, and redesign the Sidebar to match the Paperclip visual style.

**Architecture:** The dashboard page replaces the redirect in `app/(dashboard)/projects/[projectId]/page.tsx` with a client component that uses existing hooks (`useSessions`, `useTasks`, `useOrchestratorFeed`). The Sidebar gets a full interior rewrite: emoji removed, Dashboard nav item added, Projects list with colored dots, Add Project button at the bottom. Two new dashboard components (`SessionAgentCard`, `ActivityPanel`) display live data. Two small API routes handle git validation and user identity. Session stop/open logic is extracted to a shared `lib/sessionActions.ts`.

**Tech Stack:** Next.js App Router (client components, `'use client'`), React, SWR (useTasks), @tanstack/react-query (useSessions, useProjects), Vitest + @testing-library/react, inline styles matching existing palette, WebSocket via `useOrchestratorFeed`.

**Important caveats for implementers:**
- `GET /api/sessions?status=active` ignores `projectId` — always filter client-side: `sessions.filter(s => s.project_id === projectId)`.
- Two data-fetching libraries coexist: SWR (`useTasks`) and react-query (`useSessions`, `useProjects`). Use each as-is; do not migrate either.
- `openWindow` from `useSessionWindows` takes a `Session` object (from `hooks/useSessions.ts`) directly — no adapter needed.
- `useOrchestratorFeed` accepts `Session[]` and manages one WebSocket per session; feed entries have `{ id, sessionId, label, phase, text, timestamp }` where `text` is raw output.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `lib/sessionPhaseConfig.ts` | Phase initials + phase→TaskStatus mapping |
| Create | `lib/sessionActions.ts` | Shared stopSession + openTerminal logic |
| Create | `app/api/projects/validate-path/route.ts` | Git repo path validation |
| Create | `app/api/me/route.ts` | Git user.name for sidebar avatar |
| Create | `components/projects/NewProjectModal.tsx` | Add project modal |
| Rewrite | `components/layout/Sidebar.tsx` | Redesigned sidebar |
| Create | `components/dashboard/SessionAgentCard.tsx` | Live session card |
| Create | `components/dashboard/ActivityPanel.tsx` | Right panel (actions + feed) |
| Rewrite | `app/(dashboard)/projects/[projectId]/page.tsx` | Dashboard page |

---

## Task 1: Session phase config

**Files:**
- Create: `lib/sessionPhaseConfig.ts`
- Create: `lib/__tests__/sessionPhaseConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/sessionPhaseConfig.test.ts
import { PHASE_INITIALS, PHASE_TO_STATUS } from '../sessionPhaseConfig'

describe('PHASE_INITIALS', () => {
  it('maps all known session phases to 2-letter initials', () => {
    expect(PHASE_INITIALS['ideate']).toBe('ID')
    expect(PHASE_INITIALS['brainstorm']).toBe('BR')
    expect(PHASE_INITIALS['spec']).toBe('SP')
    expect(PHASE_INITIALS['plan']).toBe('PL')
    expect(PHASE_INITIALS['develop']).toBe('DV')
    expect(PHASE_INITIALS['orchestrator']).toBe('OR')
  })
})

describe('PHASE_TO_STATUS', () => {
  it('maps session phases to TaskStatus for color lookup', () => {
    expect(PHASE_TO_STATUS['ideate']).toBe('idea')
    expect(PHASE_TO_STATUS['brainstorm']).toBe('idea')
    expect(PHASE_TO_STATUS['spec']).toBe('speccing')
    expect(PHASE_TO_STATUS['plan']).toBe('planning')
    expect(PHASE_TO_STATUS['develop']).toBe('developing')
    expect(PHASE_TO_STATUS['orchestrator']).toBe('developing')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/sessionPhaseConfig.test.ts --reporter verbose
```

Expected: FAIL — `Cannot find module '../sessionPhaseConfig'`

- [ ] **Step 3: Create the config file**

```typescript
// lib/sessionPhaseConfig.ts
import type { TaskStatus } from './db/tasks'

export const PHASE_INITIALS: Record<string, string> = {
  ideate:       'ID',
  brainstorm:   'BR',
  spec:         'SP',
  plan:         'PL',
  develop:      'DV',
  orchestrator: 'OR',
}

export const PHASE_TO_STATUS: Record<string, TaskStatus> = {
  ideate:       'idea',
  brainstorm:   'idea',
  spec:         'speccing',
  plan:         'planning',
  develop:      'developing',
  orchestrator: 'developing',
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/sessionPhaseConfig.test.ts --reporter verbose
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add lib/sessionPhaseConfig.ts lib/__tests__/sessionPhaseConfig.test.ts
git commit -m "feat: add session phase config (initials + phase-to-status map)"
```

---

## Task 2: Extract session actions to shared lib

**Files:**
- Create: `lib/sessionActions.ts`
- Create: `lib/__tests__/sessionActions.test.ts`
- Modify: `components/tasks/TaskDetailView.tsx` (replace inline handleStop with stopSession import)

- [ ] **Step 1: Write the failing test**

```typescript
// lib/__tests__/sessionActions.test.ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { stopSession } from '../sessionActions'

const mockFetch = vi.fn()
const mockMutate = vi.fn()

vi.mock('swr', () => ({
  mutate: mockMutate,
}))

global.fetch = mockFetch

describe('stopSession', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockMutate.mockReset()
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('DELETEs the session endpoint', async () => {
    await stopSession('sess-123')
    expect(mockFetch).toHaveBeenCalledWith('/api/sessions/sess-123', { method: 'DELETE' })
  })

  it('invalidates the SWR sessions cache', async () => {
    await stopSession('sess-123')
    expect(mockMutate).toHaveBeenCalledWith(expect.any(Function))
    // verify predicate matches session URLs
    const predicate = mockMutate.mock.calls[0][0]
    expect(predicate('/api/sessions?status=active')).toBe(true)
    expect(predicate('/api/tasks?projectId=x')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/__tests__/sessionActions.test.ts --reporter verbose
```

Expected: FAIL — `Cannot find module '../sessionActions'`

- [ ] **Step 3: Create sessionActions.ts**

```typescript
// lib/sessionActions.ts
import { mutate as globalMutate } from 'swr'

export async function stopSession(sessionId: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
  await globalMutate((key: unknown) => typeof key === 'string' && key.includes('/api/sessions'))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run lib/__tests__/sessionActions.test.ts --reporter verbose
```

Expected: PASS — 2 tests

- [ ] **Step 5: Update TaskDetailView to use stopSession**

In `components/tasks/TaskDetailView.tsx`, replace the inline `handleStop` implementation:

```typescript
// Add this import at the top (with other lib imports):
import { stopSession } from '@/lib/sessionActions'

// Replace the handleStop function body:
async function handleStop() {
  if (!activeSessionId) return
  await stopSession(activeSessionId)
}
```

Remove the now-unused `import { mutate as globalMutate } from 'swr'` line if it's only used by handleStop. (Check — if it's used elsewhere in the file, keep it.)

- [ ] **Step 6: Run all tests to confirm no regression**

```bash
npx vitest run --reporter verbose
```

Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add lib/sessionActions.ts lib/__tests__/sessionActions.test.ts components/tasks/TaskDetailView.tsx
git commit -m "feat: extract stopSession to lib/sessionActions, update TaskDetailView"
```

---

## Task 3: Validate-path API endpoint

**Files:**
- Create: `app/api/projects/validate-path/route.ts`

This endpoint checks whether a given path is a git repository using `execFileSync`. It sits alongside the existing `app/api/projects/route.ts` and `app/api/projects/[id]/` directory — no slug conflict since `validate-path` is a static segment.

- [ ] **Step 1: Write the implementation** (no unit test needed — it's a thin shell wrapper; we'll test it manually)

```typescript
// app/api/projects/validate-path/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

export function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get('path')
  if (!rawPath) {
    return NextResponse.json({ valid: false, name: '', error: 'path required' }, { status: 400 })
  }

  try {
    execFileSync('git', ['-C', rawPath, 'rev-parse', '--git-dir'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    })
    return NextResponse.json({ valid: true, name: path.basename(rawPath) })
  } catch {
    return NextResponse.json({ valid: false, name: '', error: 'Not a git repository' })
  }
}
```

- [ ] **Step 2: Smoke-test the endpoint manually**

Start the dev server if it's not running: `npm run dev`

Then in another terminal:
```bash
curl "http://localhost:3000/api/projects/validate-path?path=$(pwd)"
```

Expected: `{"valid":true,"name":"project-control"}`

```bash
curl "http://localhost:3000/api/projects/validate-path?path=/tmp"
```

Expected: `{"valid":false,"name":"","error":"Not a git repository"}`

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/validate-path/route.ts
git commit -m "feat: add validate-path endpoint for git repo detection"
```

---

## Task 4: /api/me endpoint

**Files:**
- Create: `app/api/me/route.ts`

Returns the global git `user.name` for the sidebar bottom avatar. Falls back to the system username.

- [ ] **Step 1: Write the implementation**

```typescript
// app/api/me/route.ts
import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import os from 'os'

function gitUserName(): string {
  try {
    return execFileSync('git', ['config', '--global', 'user.name'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe',
    }).trim()
  } catch {
    return os.userInfo().username
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function GET() {
  const name = gitUserName()
  return NextResponse.json({ name, initials: initials(name) })
}
```

- [ ] **Step 2: Smoke-test**

```bash
curl http://localhost:3000/api/me
```

Expected: `{"name":"Your Name","initials":"YN"}` (matching your git config)

- [ ] **Step 3: Commit**

```bash
git add app/api/me/route.ts
git commit -m "feat: add /api/me endpoint returning git user name + initials"
```

---

## Task 5: NewProjectModal component

**Files:**
- Create: `components/projects/NewProjectModal.tsx`
- Create: `components/__tests__/NewProjectModal.test.tsx`

A focused modal for adding a new git repo project. Validates the path via `/api/projects/validate-path` on blur, auto-populates the name from the repo directory name, then POSTs to `/api/projects`.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/NewProjectModal.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NewProjectModal } from '../projects/NewProjectModal'

// Mock useAddProject (react-query mutation)
const mockMutateAsync = vi.fn()
vi.mock('@/hooks/useProjects', () => ({
  useAddProject: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

// Mock router
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock fetch for validate-path
global.fetch = vi.fn()

describe('NewProjectModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal with path and name inputs', () => {
    render(<NewProjectModal onClose={onClose} />)
    expect(screen.getByPlaceholderText('/absolute/path/to/repo')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Project name')).toBeInTheDocument()
  })

  it('shows validation error when path is not a git repo', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false, error: 'Not a git repository' }),
    })
    render(<NewProjectModal onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/tmp' } })
    fireEvent.blur(pathInput)
    await waitFor(() => {
      expect(screen.getByText('Not a git repository')).toBeInTheDocument()
    })
  })

  it('auto-populates name from validated path', async () => {
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ valid: true, name: 'my-repo' }),
    })
    render(<NewProjectModal onClose={onClose} />)
    const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
    fireEvent.change(pathInput, { target: { value: '/home/user/my-repo' } })
    fireEvent.blur(pathInput)
    await waitFor(() => {
      expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('my-repo')
    })
  })

  it('calls onClose when cancel is clicked', () => {
    render(<NewProjectModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/NewProjectModal.test.tsx --reporter verbose
```

Expected: FAIL — `Cannot find module '../projects/NewProjectModal'`

- [ ] **Step 3: Create the component**

```tsx
// components/projects/NewProjectModal.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAddProject } from '@/hooks/useProjects'

type Props = { onClose: () => void }

export function NewProjectModal({ onClose }: Props) {
  const router = useRouter()
  const addProject = useAddProject()
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  async function validatePath(rawPath: string) {
    if (!rawPath.trim()) return
    setValidating(true)
    setPathError(null)
    try {
      const res = await fetch(`/api/projects/validate-path?path=${encodeURIComponent(rawPath.trim())}`)
      const data = await res.json()
      if (data.valid) {
        if (!name) setName(data.name)
        setPathError(null)
      } else {
        setPathError(data.error ?? 'Not a git repository')
      }
    } catch {
      setPathError('Could not validate path')
    } finally {
      setValidating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!path.trim() || !name.trim() || pathError) return
    const result = await addProject.mutateAsync({ name: name.trim(), path: path.trim() })
    onClose()
    router.push(`/projects/${result.id}`)
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  }
  const modal: React.CSSProperties = {
    background: '#141618', border: '1px solid #1e2124', borderRadius: 10,
    padding: 28, width: 420, fontFamily: 'system-ui, sans-serif',
  }
  const label: React.CSSProperties = { color: '#8a9199', fontSize: 11, marginBottom: 6, display: 'block' }
  const input: React.CSSProperties = {
    width: '100%', background: '#0d0e10', border: '1px solid #1e2124', borderRadius: 6,
    color: '#e2e6ea', fontSize: 13, padding: '8px 10px', boxSizing: 'border-box', outline: 'none',
  }
  const btnRow: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          Add Project
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Git repo path</label>
            <input
              style={{ ...input, borderColor: pathError ? '#c04040' : '#1e2124' }}
              placeholder="/absolute/path/to/repo"
              value={path}
              onChange={e => { setPath(e.target.value); setPathError(null) }}
              onBlur={e => validatePath(e.target.value)}
              autoFocus
            />
            {validating && <div style={{ color: '#5a6370', fontSize: 11, marginTop: 4 }}>Checking…</div>}
            {pathError && <div style={{ color: '#c04040', fontSize: 11, marginTop: 4 }}>{pathError}</div>}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={label}>Project name</label>
            <input
              style={input}
              placeholder="Project name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div style={btnRow}>
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: '1px solid #1e2124', color: '#8a9199', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button type="submit"
              disabled={!path.trim() || !name.trim() || !!pathError || validating || addProject.isPending}
              style={{
                background: !path.trim() || !name.trim() || !!pathError ? '#1c1f22' : '#5b9bd5',
                border: 'none', color: '#e2e6ea', borderRadius: 6, padding: '7px 14px',
                cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
              {addProject.isPending ? 'Adding…' : 'Add Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run components/__tests__/NewProjectModal.test.tsx --reporter verbose
```

Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add components/projects/NewProjectModal.tsx components/__tests__/NewProjectModal.test.tsx app/api/projects/validate-path/route.ts app/api/me/route.ts
git commit -m "feat: NewProjectModal with path validation; validate-path and /api/me endpoints"
```

---

## Task 6: Sidebar redesign

**Files:**
- Rewrite: `components/layout/Sidebar.tsx`

Redesign: remove emoji, add Dashboard nav item with live session count badge, keep Pipeline with task counts and live dots, add Projects section with colored dots listing all known projects, add "Add Project" button at the bottom that opens `NewProjectModal`, add user avatar from `/api/me` at the very bottom.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/Sidebar.test.tsx
import { render, screen } from '@testing-library/react'
import { Sidebar } from '../layout/Sidebar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SWRConfig } from 'swr'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

// Mock hooks
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [], error: null, isLoading: false }),
}))
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({ data: [], isLoading: false }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [
    { id: 'p1', name: 'project-control', path: '/home/user/project-control', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
    { id: 'p2', name: 'other-repo', path: '/home/user/other-repo', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
  ], isLoading: false }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1',
  useRouter: () => ({ push: vi.fn() }),
}))
global.fetch = vi.fn().mockResolvedValue({
  ok: true, json: async () => ({ name: 'Test User', initials: 'TU' }),
})

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <SWRConfig value={{ provider: () => new Map() }}>
        <SessionWindowProvider>{children}</SessionWindowProvider>
      </SWRConfig>
    </QueryClientProvider>
  )
}

describe('Sidebar', () => {
  it('renders Dashboard nav item', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders Pipeline section with phase labels (no emoji)', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('Ideas')).toBeInTheDocument()
    expect(screen.getByText('Specs')).toBeInTheDocument()
    // No emoji characters in nav items
    const pipeline = screen.getByText('Pipeline')
    expect(pipeline.closest('div')?.textContent).not.toMatch(/[💡📐📋⚙️]/)
  })

  it('renders Projects section with project names', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('project-control')).toBeInTheDocument()
    expect(screen.getByText('other-repo')).toBeInTheDocument()
  })

  it('renders Add Project button', () => {
    render(<Sidebar projectId="p1" projectName="project-control" projectPath="/home/user/project-control" />, { wrapper })
    expect(screen.getByText('+ Add Project')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/Sidebar.test.tsx --reporter verbose
```

Expected: FAIL — test finds emoji in nav or missing Dashboard/Projects items

- [ ] **Step 3: Rewrite Sidebar.tsx**

Replace the entire file:

```tsx
// components/layout/Sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useTasks } from '@/hooks/useTasks'
import { useSessions } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { STATUS_TO_SESSION_PHASES } from '@/lib/taskPhaseConfig'
import { NewProjectModal } from '@/components/projects/NewProjectModal'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type GitInfo = { branch: string; lastCommit: string; uncommitted: number }
type Me = { name: string; initials: string }

type Props = { projectId: string; projectName: string; projectPath: string }

const PIPELINE_ITEMS = [
  { label: 'Ideas',      status: 'idea'       as const, route: 'ideas' },
  { label: 'Specs',      status: 'speccing'   as const, route: 'specs' },
  { label: 'Plans',      status: 'planning'   as const, route: 'plans' },
  { label: 'Developing', status: 'developing' as const, route: 'developing' },
  { label: 'Done',       status: 'done'       as const, route: 'done' },
]

const DOT_COLORS = ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']

export function Sidebar({ projectId, projectName, projectPath }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [showAddProject, setShowAddProject] = useState(false)
  const { data: git } = useSWR<GitInfo>(`/api/projects/${projectId}/git-info`, fetcher, { refreshInterval: 10000 })
  const [me, setMe] = useState<Me | null>(null)
  const { data: allProjects = [] } = useProjects()
  const { data: allSessions = [] } = useSessions({ status: 'active' })

  const activeSessions = allSessions.filter(s => s.project_id === projectId)
  const liveCount = activeSessions.length

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => null)
  }, [])

  const sidebarStyle: React.CSSProperties = {
    width: 200,
    background: '#0c0e10',
    borderRight: '1px solid #1c1f22',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    height: '100vh',
    position: 'sticky',
    top: 0,
    overflow: 'hidden',
  }

  return (
    <>
      <div style={sidebarStyle}>
        {/* App header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1c1f22' }}>
          <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 13, letterSpacing: '-0.2px' }}>
            Project Control
          </div>
          <div style={{ color: '#454c54', fontSize: 10, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {projectName}
          </div>
        </div>

        {/* Primary nav */}
        <div style={{ padding: '8px 8px 4px' }}>
          <NavItem
            href={`/projects/${projectId}`}
            active={pathname === `/projects/${projectId}` || pathname === `/projects/${projectId}/dashboard`}
            badge={liveCount > 0 ? liveCount : undefined}
            badgeColor="#3a8c5c"
          >
            Dashboard
          </NavItem>
          <NavItem href="/inbox" active={pathname === '/inbox'}>
            Inbox
          </NavItem>
        </div>

        {/* Pipeline section */}
        <div style={{ padding: '6px 8px', flex: 1, overflowY: 'auto' }}>
          <SectionLabel>Pipeline</SectionLabel>
          {PIPELINE_ITEMS.map(item => (
            <PipelineNavItem
              key={item.status}
              projectId={projectId}
              item={item}
              active={pathname.includes(`/projects/${projectId}/${item.route}`)}
              activeSessions={activeSessions}
            />
          ))}
        </div>

        {/* Git info */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #1c1f22', background: '#0a0c0e' }}>
          <Row label="branch" value={git?.branch ?? '…'} valueColor="#5b9bd5" mono />
          <Row label="last commit" value={git?.lastCommit ?? '…'} />
        </div>

        {/* Projects section */}
        <div style={{ padding: '8px 8px 4px', borderTop: '1px solid #1c1f22' }}>
          <SectionLabel>Projects</SectionLabel>
          {allProjects.slice(0, 6).map((p, i) => (
            <button
              key={p.id}
              onClick={() => router.push(`/projects/${p.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                background: p.id === projectId ? '#1c1f22' : 'none',
                border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                textAlign: 'left', marginBottom: 1,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: DOT_COLORS[i % DOT_COLORS.length],
              }} />
              <span style={{
                color: p.id === projectId ? '#e2e6ea' : '#8a9199', fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Bottom: Add Project + user avatar */}
        <div style={{ borderTop: '1px solid #1c1f22' }}>
          <button
            onClick={() => setShowAddProject(true)}
            style={{
              display: 'block', width: '100%', padding: '10px 14px', background: 'none',
              border: 'none', color: '#5a6370', fontSize: 12, textAlign: 'left',
              cursor: 'pointer', borderBottom: '1px solid #1c1f22',
            }}
          >
            + Add Project
          </button>
          {me && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: '#1a2530',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5b9bd5', fontSize: 9, fontWeight: 700, flexShrink: 0,
              }}>
                {me.initials}
              </div>
              <span style={{ color: '#5a6370', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {showAddProject && <NewProjectModal onClose={() => setShowAddProject(false)} />}
    </>
  )
}

function NavItem({ href, active, badge, badgeColor, children }: {
  href: string; active: boolean; badge?: number; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', borderRadius: 6, marginBottom: 1,
        background: active ? '#1c1f22' : 'none',
        borderLeft: active ? '2px solid #5b9bd5' : '2px solid transparent',
      }}>
        <span style={{ color: active ? '#e2e6ea' : '#8a9199', fontSize: 13 }}>{children}</span>
        {badge !== undefined && (
          <span style={{
            background: badgeColor ?? '#1c1f22', color: '#fff',
            padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          }}>{badge}</span>
        )}
      </div>
    </Link>
  )
}

function PipelineNavItem({ projectId, item, active, activeSessions }: {
  projectId: string
  item: typeof PIPELINE_ITEMS[number]
  active: boolean
  activeSessions: { phase: string }[]
}) {
  const { tasks } = useTasks(projectId, item.status)
  const hasLive = activeSessions.some(s => (STATUS_TO_SESSION_PHASES[item.status] ?? []).includes(s.phase))

  return (
    <Link href={`/projects/${projectId}/${item.route}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 8px', borderRadius: 6, marginBottom: 1,
        background: active ? '#1c1f22' : 'transparent',
      }}>
        <span style={{ color: active ? '#e2e6ea' : '#8a9199', fontSize: 12 }}>{item.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3a8c5c', display: 'inline-block' }} />}
          <span style={{ background: '#1c1f22', color: '#454c54', padding: '1px 5px', borderRadius: 10, fontSize: 10 }}>
            {tasks.length}
          </span>
        </span>
      </div>
    </Link>
  )
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#454c54', fontSize: 10 }}>{label}</span>
      <span style={{ color: valueColor ?? '#5a6370', fontSize: 10, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#2e3338', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px 6px' }}>
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run components/__tests__/Sidebar.test.tsx --reporter verbose
```

Expected: PASS — 4 tests

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run --reporter verbose
```

Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add components/layout/Sidebar.tsx components/__tests__/Sidebar.test.tsx components/projects/NewProjectModal.tsx
git commit -m "feat: redesign Sidebar — Dashboard nav, Projects list, Add Project button, no emoji"
```

---

## Task 7: SessionAgentCard component

**Files:**
- Create: `components/dashboard/SessionAgentCard.tsx`
- Create: `components/__tests__/SessionAgentCard.test.tsx`

Displays a single session as an "agent card": avatar with phase initials, Live/Finished badge, last 5 tool-call pills from the feed, Open Terminal and Stop buttons.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/SessionAgentCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionAgentCard } from '../dashboard/SessionAgentCard'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

const mockSession = {
  id: 'sess-1',
  project_id: 'proj-1',
  label: 'Redesign dashboard',
  phase: 'spec',
  source_file: null,
  status: 'active',
  created_at: '2026-03-31T08:00:00Z',
  ended_at: null,
}

const mockFeedEntries = [
  { id: 'e1', sessionId: 'sess-1', label: 'Redesign', phase: 'spec', text: 'Write · components/Sidebar.tsx', timestamp: '2026-03-31T08:01:00Z' },
  { id: 'e2', sessionId: 'sess-1', label: 'Redesign', phase: 'spec', text: 'Bash · npm test', timestamp: '2026-03-31T08:01:30Z' },
]

const mockOnStop = vi.fn()
const mockOnOpenTerminal = vi.fn()

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionWindowProvider>{children}</SessionWindowProvider>
}

describe('SessionAgentCard', () => {
  it('renders session label', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText('Redesign dashboard')).toBeInTheDocument()
  })

  it('shows Live badge for active session', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows phase initials in avatar (SP for spec)', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText('SP')).toBeInTheDocument()
  })

  it('renders WRITE pill for Write feed entries', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText('WRITE')).toBeInTheDocument()
    expect(screen.getByText('components/Sidebar.tsx')).toBeInTheDocument()
  })

  it('calls onStop when Stop button is clicked', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Stop'))
    expect(mockOnStop).toHaveBeenCalled()
  })

  it('calls onOpenTerminal when Open Terminal is clicked', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Open Terminal'))
    expect(mockOnOpenTerminal).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/SessionAgentCard.test.tsx --reporter verbose
```

Expected: FAIL — `Cannot find module '../dashboard/SessionAgentCard'`

- [ ] **Step 3: Create SessionAgentCard.tsx**

```tsx
// components/dashboard/SessionAgentCard.tsx
'use client'
import type { Session } from '@/hooks/useSessions'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'
import { PHASE_INITIALS, PHASE_TO_STATUS } from '@/lib/sessionPhaseConfig'
import { PHASE_CONFIG } from '@/lib/taskPhaseConfig'

// Parse a raw feed text line into a pill descriptor
type Pill = { type: 'Write' | 'Edit' | 'Bash' | 'Read' | 'Glob' | 'Grep' | 'other'; detail: string }

function parsePill(text: string): Pill | null {
  const match = text.match(/^(Write|Edit|Bash|Read|Glob|Grep)\s+·\s+(.+)$/m)
  if (!match) return null
  return { type: match[1] as Pill['type'], detail: match[2].trim() }
}

const PILL_COLORS: Record<string, string> = {
  Write: '#8f77c9', Edit: '#8f77c9',
  Bash: '#c97e2a',
  Read: '#5a6370', Glob: '#5a6370', Grep: '#5a6370',
}

type Props = {
  session: Session
  feedEntries: FeedEntry[]
  onStop: () => void
  onOpenTerminal: () => void
}

export function SessionAgentCard({ session, feedEntries, onStop, onOpenTerminal }: Props) {
  const isLive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const taskStatus = PHASE_TO_STATUS[session.phase] ?? 'developing'
  const phaseStyle = PHASE_CONFIG[taskStatus]

  const pills = feedEntries
    .slice(-5)
    .map(e => parsePill(e.text))
    .filter((p): p is Pill => p !== null)

  const card: React.CSSProperties = {
    background: '#141618', border: '1px solid #1e2124', borderRadius: 8,
    overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
  }

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #1e2124' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: phaseStyle.bgColor, border: `1px solid ${phaseStyle.color}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: phaseStyle.color, fontSize: 10, fontWeight: 700,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#e2e6ea', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.label}
            </div>
            <div style={{ color: '#5a6370', fontSize: 10, marginTop: 2 }}>{session.phase}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3a8c5c', display: 'inline-block' }} />}
            <span style={{ color: isLive ? '#3a8c5c' : '#454c54', fontSize: 11, fontWeight: 600 }}>
              {isLive ? 'Live' : 'Finished'}
            </span>
          </div>
        </div>
      </div>

      {/* Action feed */}
      <div style={{ padding: '10px 14px', minHeight: 60, borderBottom: '1px solid #1e2124', fontFamily: 'monospace' }}>
        {pills.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 11 }}>Waiting for tool calls…</div>
        ) : (
          pills.map((pill, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                background: (PILL_COLORS[pill.type] ?? '#5a6370') + '22',
                color: PILL_COLORS[pill.type] ?? '#5a6370',
                borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700,
                flexShrink: 0,
              }}>
                {pill.type.toUpperCase()}
              </span>
              <span style={{ color: '#8a9199', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pill.detail}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
        <button onClick={onOpenTerminal} style={{
          flex: 1, background: '#1c1f22', border: '1px solid #2e3338', color: '#8a9199',
          borderRadius: 6, padding: '6px 0', fontSize: 12, cursor: 'pointer',
        }}>
          Open Terminal
        </button>
        {isLive && (
          <button onClick={onStop} style={{
            background: 'none', border: '1px solid #c0404044', color: '#c04040',
            borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run components/__tests__/SessionAgentCard.test.tsx --reporter verbose
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/SessionAgentCard.tsx components/__tests__/SessionAgentCard.test.tsx
git commit -m "feat: SessionAgentCard — phase avatar, live badge, tool-call feed pills, stop/terminal buttons"
```

---

## Task 8: ActivityPanel component

**Files:**
- Create: `components/dashboard/ActivityPanel.tsx`
- Create: `components/__tests__/ActivityPanel.test.tsx`

Right-side panel with two sections: **Actions Required** (tasks needing user attention, derived from task state) and **Live Feed** (aggregated event stream from all active sessions).

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/ActivityPanel.test.tsx
import { render, screen } from '@testing-library/react'
import { ActivityPanel } from '../dashboard/ActivityPanel'
import type { Task } from '@/lib/db/tasks'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'

const makePlanTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1', project_id: 'p1', title: 'Redesign Sidebar', status: 'planning',
  idea_file: null, spec_file: null, plan_file: '/path/plan.md', dev_summary: null,
  notes: null, created_at: '2026-03-31T08:00:00Z', updated_at: '2026-03-31T08:00:00Z',
  ...overrides,
})

const feedEntries: FeedEntry[] = [
  { id: 'f1', sessionId: 's1', label: 'Session A', phase: 'spec', text: 'Write · Sidebar.tsx', timestamp: '2026-03-31T08:01:00Z' },
  { id: 'f2', sessionId: 's2', label: 'Session B', phase: 'plan', text: 'Read · plan.md', timestamp: '2026-03-31T08:02:00Z' },
]

describe('ActivityPanel', () => {
  it('renders the Actions Required section', () => {
    render(<ActivityPanel tasks={[makePlanTask()]} feed={[]} />)
    expect(screen.getByText('Actions Required')).toBeInTheDocument()
  })

  it('shows a plan-ready action for a planning task with plan_file', () => {
    render(<ActivityPanel tasks={[makePlanTask()]} feed={[]} />)
    expect(screen.getByText('Redesign Sidebar')).toBeInTheDocument()
    expect(screen.getByText('Plan ready')).toBeInTheDocument()
  })

  it('renders Live Feed section', () => {
    render(<ActivityPanel tasks={[]} feed={feedEntries} />)
    expect(screen.getByText('Live Feed')).toBeInTheDocument()
  })

  it('renders feed entries newest first', () => {
    render(<ActivityPanel tasks={[]} feed={feedEntries} />)
    const items = screen.getAllByRole('listitem')
    // f2 is newer, should appear first
    expect(items[0].textContent).toContain('Read · plan.md')
    expect(items[1].textContent).toContain('Write · Sidebar.tsx')
  })

  it('shows empty state when no actions required', () => {
    render(<ActivityPanel tasks={[]} feed={[]} />)
    expect(screen.getByText('No actions required')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/ActivityPanel.test.tsx --reporter verbose
```

Expected: FAIL — `Cannot find module '../dashboard/ActivityPanel'`

- [ ] **Step 3: Create ActivityPanel.tsx**

```tsx
// components/dashboard/ActivityPanel.tsx
'use client'
import Link from 'next/link'
import type { Task } from '@/lib/db/tasks'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type ActionItem = {
  taskId: string
  title: string
  tag: string
  tagColor: string
  href: string
}

function deriveActions(tasks: Task[]): ActionItem[] {
  const actions: ActionItem[] = []
  for (const t of tasks) {
    if (t.status === 'planning' && t.plan_file) {
      actions.push({
        taskId: t.id, title: t.title,
        tag: 'Plan ready', tagColor: '#8f77c9',
        href: `/projects/${t.project_id}/plans`,
      })
    } else if (t.status === 'developing' && !t.plan_file) {
      // developing with no plan on file — nudge user to check output
    }
  }
  return actions
}

type Props = { tasks: Task[]; feed: FeedEntry[] }

export function ActivityPanel({ tasks, feed }: Props) {
  const actions = deriveActions(tasks)
  const sortedFeed = [...feed].reverse()

  const panel: React.CSSProperties = {
    width: 248, flexShrink: 0, background: '#0c0e10',
    borderLeft: '1px solid #1c1f22', display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
  }

  return (
    <div style={panel}>
      {/* Actions Required */}
      <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #1c1f22', flexShrink: 0 }}>
        <div style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Actions Required
        </div>
        {actions.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 12 }}>No actions required</div>
        ) : (
          actions.map(a => (
            <Link key={a.taskId} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: '#141618', border: '1px solid #1e2124', marginBottom: 6, cursor: 'pointer' }}>
                <span style={{ color: '#c8ced6', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.title}</span>
                <span style={{ background: a.tagColor + '22', color: a.tagColor, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>
                  {a.tag}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Live Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Live Feed
        </div>
        {sortedFeed.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 12 }}>No activity yet</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sortedFeed.slice(0, 100).map(entry => {
              const initials = PHASE_INITIALS[entry.phase] ?? entry.phase.slice(0, 2).toUpperCase()
              const age = formatAge(entry.timestamp)
              return (
                <li key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#1a2530', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#5b9bd5', fontSize: 8, fontWeight: 700,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#5a6370', fontSize: 10, marginBottom: 2 }}>{age}</div>
                    <div style={{ color: '#8a9199', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.text}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run components/__tests__/ActivityPanel.test.tsx --reporter verbose
```

Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/ActivityPanel.tsx components/__tests__/ActivityPanel.test.tsx
git commit -m "feat: ActivityPanel — actions required heuristics + live feed"
```

---

## Task 9: Dashboard page

**Files:**
- Rewrite: `app/(dashboard)/projects/[projectId]/page.tsx`
- Create: `components/__tests__/DashboardPage.test.tsx`

Replace the redirect with a live dashboard. Composes `SessionAgentCard` × N (one per active session for this project) + a "Waiting" task grid + `ActivityPanel` on the right. Uses `useSessions` (react-query) + `useTasks` (SWR) + `useOrchestratorFeed`.

- [ ] **Step 1: Write the failing test**

```typescript
// components/__tests__/DashboardPage.test.tsx
import { render, screen } from '@testing-library/react'
import DashboardPage from '../../app/(dashboard)/projects/[projectId]/page'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SWRConfig } from 'swr'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

// Mock hooks
vi.mock('@/hooks/useSessions', () => ({
  useSessions: vi.fn(() => ({
    data: [
      { id: 's1', project_id: 'proj-1', label: 'Build dashboard', phase: 'spec', source_file: null, status: 'active', created_at: '2026-03-31T08:00:00Z', ended_at: null },
    ],
    isLoading: false,
  })),
}))
vi.mock('@/hooks/useTasks', () => ({
  useTasks: vi.fn(() => ({ tasks: [], isLoading: false })),
}))
vi.mock('@/hooks/useOrchestratorFeed', () => ({
  useOrchestratorFeed: vi.fn(() => ({ feed: [] })),
}))
vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'proj-1' }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <SWRConfig value={{ provider: () => new Map() }}>
        <SessionWindowProvider>{children}</SessionWindowProvider>
      </SWRConfig>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('renders the Live Sessions heading', () => {
    render(<DashboardPage />, { wrapper })
    expect(screen.getByText('Live Sessions')).toBeInTheDocument()
  })

  it('renders a SessionAgentCard for each active session in this project', () => {
    render(<DashboardPage />, { wrapper })
    expect(screen.getByText('Build dashboard')).toBeInTheDocument()
  })

  it('renders the ActivityPanel', () => {
    render(<DashboardPage />, { wrapper })
    expect(screen.getByText('Actions Required')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run components/__tests__/DashboardPage.test.tsx --reporter verbose
```

Expected: FAIL — page exports a redirect, not the dashboard component

- [ ] **Step 3: Rewrite the dashboard page**

```tsx
// app/(dashboard)/projects/[projectId]/page.tsx
'use client'
import { useParams } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import { useTasks } from '@/hooks/useTasks'
import { useOrchestratorFeed } from '@/hooks/useOrchestratorFeed'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { stopSession } from '@/lib/sessionActions'
import { SessionAgentCard } from '@/components/dashboard/SessionAgentCard'
import { ActivityPanel } from '@/components/dashboard/ActivityPanel'

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: allSessions = [] } = useSessions({ status: 'active' })
  const { tasks } = useTasks(projectId)
  const { openWindow } = useSessionWindows()

  // Filter to this project only (the API doesn't filter active sessions by projectId)
  const activeSessions = allSessions.filter(s => s.project_id === projectId)

  const { feed } = useOrchestratorFeed(activeSessions)

  // Tasks with no active session that are not done — shown in Waiting grid
  const activeSessionTaskIds = new Set(activeSessions.map(s => s.id))
  const waitingTasks = tasks.filter(t => t.status !== 'done' && !activeSessionTaskIds.has(t.id))

  const headingStyle: React.CSSProperties = {
    color: '#8a9199', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14,
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, margin: -24 }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* Live Sessions */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={headingStyle}>Live Sessions</div>
            {activeSessions.length > 0 && (
              <span style={{ background: '#3a8c5c', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 600, marginBottom: 14 }}>
                {activeSessions.length}
              </span>
            )}
          </div>

          {activeSessions.length === 0 ? (
            <div style={{ color: '#2e3338', fontSize: 14, padding: '24px 0' }}>
              No active sessions — start one from the pipeline pages.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {activeSessions.map(session => {
                const sessionFeed = feed.filter(e => e.sessionId === session.id)
                return (
                  <SessionAgentCard
                    key={session.id}
                    session={session}
                    feedEntries={sessionFeed}
                    onStop={() => stopSession(session.id)}
                    onOpenTerminal={() => openWindow(session)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Waiting tasks */}
        {waitingTasks.length > 0 && (
          <div>
            <div style={headingStyle}>Waiting</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {waitingTasks.map(task => (
                <div key={task.id} style={{
                  background: '#141618', border: '1px solid #1e2124', borderRadius: 8,
                  padding: '12px 14px', fontFamily: 'system-ui, sans-serif',
                }}>
                  <div style={{ color: '#c8ced6', fontSize: 13, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </div>
                  <div style={{ color: '#454c54', fontSize: 11 }}>{task.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity panel */}
      <ActivityPanel tasks={tasks} feed={feed} />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run components/__tests__/DashboardPage.test.tsx --reporter verbose
```

Expected: PASS — 3 tests

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run --reporter verbose
```

Expected: All pass

- [ ] **Step 6: Smoke-test in the browser**

Navigate to `http://localhost:3000/projects/<any-project-id>`. Verify:
- Dashboard renders (no redirect to /ideas)
- Sidebar shows Dashboard nav item at top, Projects section with colored dots, "+ Add Project" at bottom
- If any active sessions exist: cards appear with phase avatar, Live badge, feed pills
- ActivityPanel visible on the right
- Clicking "+ Add Project" opens the modal; typing a valid git path populates the name field

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/projects/\[projectId\]/page.tsx components/__tests__/DashboardPage.test.tsx
git commit -m "feat: dashboard page — live session cards, waiting grid, activity panel"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| Visual language (palette, no emoji, avatar initials, pills) | Task 6 (Sidebar), Task 7 (SessionAgentCard) |
| Sidebar: Dashboard nav + live badge | Task 6 |
| Sidebar: Pipeline with counts + live dots | Task 6 |
| Sidebar: Projects with colored dots | Task 6 |
| Sidebar: Add Project button + modal | Tasks 5, 6 |
| Sidebar: user avatar from git config | Tasks 4, 6 |
| Dashboard page: Live Sessions grid | Task 9 |
| Dashboard page: Waiting tasks grid | Task 9 |
| SessionAgentCard: avatar, badge, feed pills, buttons | Task 7 |
| ActivityPanel: Actions Required heuristics | Task 8 |
| ActivityPanel: Live Feed aggregated WS | Task 8 |
| NewProjectModal: path validation, name auto-populate | Task 5 |
| validate-path API | Task 3 |
| /api/me API | Task 4 |
| lib/sessionPhaseConfig | Task 1 |
| lib/sessionActions (shared stop logic) | Task 2 |

All sections covered. No gaps.
