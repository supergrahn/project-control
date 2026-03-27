# Nav Redesign + Project-Scoped Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the top nav to a single workflow bar (Ideas → Specs → Plans → In Development → Reports) with a right sidebar drawer for secondary tools, and make all workflow pages project-scoped under `/projects/[projectId]/`.

**Architecture:** The existing `ProjectProvider` (in `Providers.tsx`) stores the active project in localStorage. We add a project-scoped layout at `app/(dashboard)/projects/[projectId]/layout.tsx` that reads the URL param and syncs it to the project store via `openProject()`. All workflow pages are moved to the new route without content changes (they already use `useProjectStore().selectedProject`). The `TopNav` is simplified to 5 items + a `[☰]` button that opens a new `NavDrawer` component sliding in from the right.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react, `useParams()` from `next/navigation`

> **Next.js 16 note:** In client components, use `useParams()` from `next/navigation` to read dynamic route params. `params` prop is a Promise in this version — always use `useParams()` in client components, never `use(params)` in layouts.

---

### Task 1: Simplify TopNav — remove flat nav, add flow items + drawer button

**Files:**
- Modify: `components/nav/TopNav.tsx`

**Step 1: Read the current TopNav**

Open `components/nav/TopNav.tsx` and note the existing `NAV_ITEMS` array (18 items) and the right-side icon row.

**Step 2: Write the updated TopNav**

Replace the entire `NAV_ITEMS` array and `<nav>` block. The flow items link to `/projects/[activeProjectId]/[page]`. When no project is active, disable the links (render as `<span>` instead of `<Link>`).

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Settings, Brain, Focus, Bell, Menu } from 'lucide-react'
import { ProjectTabs } from './ProjectTabs'
import { useFocus } from '@/hooks/useFocus'
import { useProjects } from '@/hooks/useProjects'
import { useNotifications, useMarkRead } from '@/hooks/useNotifications'
import { useProjectStore } from '@/hooks/useProjects'

const FLOW_ITEMS = [
  { label: 'Ideas', slug: 'ideas' },
  { label: 'Specs', slug: 'specs' },
  { label: 'Plans', slug: 'plans' },
  { label: 'In Development', slug: 'developing' },
  { label: 'Reports', slug: 'reports' },
]

type TopNavProps = {
  onAssistantToggle?: () => void
  isAssistantOpen?: boolean
  onDrawerToggle?: () => void
  isDrawerOpen?: boolean
}

export function TopNav({ onAssistantToggle, isAssistantOpen, onDrawerToggle, isDrawerOpen }: TopNavProps = {}) {
  const pathname = usePathname()
  const { focusIds, isFocused, toggleFocus, clearFocus } = useFocus()
  const { data: allProjects = [] } = useProjects()
  const { selectedProject } = useProjectStore()
  const [showFocusMenu, setShowFocusMenu] = useState(false)
  const { data: notifData } = useNotifications()
  const markRead = useMarkRead()
  const [showNotifs, setShowNotifs] = useState(false)
  const unreadCount = notifData?.unreadCount ?? 0

  return (
    <header className="border-b border-zinc-800 bg-zinc-950">
      <div className="h-11 flex items-center gap-4 px-4">
        <span className="font-bold text-violet-400 text-sm shrink-0">⬡ Project Control</span>
        <nav className="flex gap-1 ml-2">
          {FLOW_ITEMS.map((item) => {
            const href = selectedProject ? `/projects/${selectedProject.id}/${item.slug}` : null
            const isActive = href ? pathname.startsWith(href) : false
            if (!href) {
              return (
                <span key={item.slug} className="px-3 py-1 rounded text-sm text-zinc-600 cursor-not-allowed">
                  {item.label}
                </span>
              )
            }
            return (
              <Link
                key={item.slug}
                href={href}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  isActive ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {/* Focus */}
          <div className="relative">
            <button
              onClick={() => setShowFocusMenu(p => !p)}
              className={`p-1.5 rounded transition-colors ${isFocused ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Focus Mode"
            >
              <Focus size={16} />
            </button>
            {showFocusMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                {allProjects.map(p => (
                  <button key={p.id} onClick={() => toggleFocus(p.id)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 flex items-center gap-2">
                    <span className={`w-3 h-3 rounded border ${focusIds.includes(p.id) ? 'bg-amber-500 border-amber-500' : 'border-zinc-600'}`} />
                    <span className="text-zinc-300">{p.name}</span>
                  </button>
                ))}
                {isFocused && (
                  <button onClick={() => { clearFocus(); setShowFocusMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800 border-t border-zinc-800 mt-1">
                    Clear focus
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Bell */}
          <div className="relative">
            <button onClick={() => setShowNotifs(p => !p)}
              className={`p-1.5 rounded transition-colors relative ${unreadCount > 0 ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-200">Notifications</span>
                  {unreadCount > 0 && (
                    <button onClick={() => { markRead.mutate({ markAll: true }); setShowNotifs(false) }}
                      className="text-[10px] text-zinc-500 hover:text-zinc-300">Mark all read</button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {(notifData?.events ?? []).map(e => (
                    <div key={e.id} className="px-3 py-2 border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer"
                      onClick={() => markRead.mutate({ eventId: e.id })}>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${e.severity === 'warn' ? 'bg-amber-500' : 'bg-red-500'}`} />
                        <span className="text-xs text-zinc-300 flex-1 truncate">{e.summary}</span>
                      </div>
                    </div>
                  ))}
                  {(notifData?.events ?? []).length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">No unread notifications</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Assistant */}
          {onAssistantToggle && (
            <button
              onClick={onAssistantToggle}
              className={`p-1.5 rounded transition-colors ${isAssistantOpen ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              title="Toggle Assistant"
            >
              <Brain size={16} />
            </button>
          )}
          {/* Settings */}
          <Link href="/settings" className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <Settings size={16} />
          </Link>
          {/* Drawer toggle */}
          <button
            onClick={onDrawerToggle}
            className={`p-1.5 rounded transition-colors ${isDrawerOpen ? 'text-violet-400 bg-violet-500/10' : 'text-zinc-500 hover:text-zinc-300'}`}
            title="More tools"
          >
            <Menu size={16} />
          </button>
        </div>
      </div>
      {isFocused && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300">
          Focused on: {allProjects.filter(p => focusIds.includes(p.id)).map(p => p.name).join(', ')}
        </div>
      )}
      <ProjectTabs />
    </header>
  )
}
```

**Step 3: Verify the app compiles**

Run: `npm run dev`
Expected: Dev server starts without TypeScript errors in the terminal. Visit `http://localhost:3000` — nav shows 5 items instead of 18. When no project is selected, items are greyed out. `[☰]` button appears at far right.

**Step 4: Commit**

```bash
git add components/nav/TopNav.tsx
git commit -m "feat: simplify TopNav to 5 workflow items + drawer button"
```

---

### Task 2: Create NavDrawer component

**Files:**
- Create: `components/nav/NavDrawer.tsx`

The drawer slides in from the right. It overlays the content (fixed position). Clicking outside or pressing Escape closes it. Secondary items link to their existing flat routes (e.g. `/insights`, `/git-activity`) — these pages already work via `useProjectStore().selectedProject`.

**Step 1: Create the file**

```tsx
// components/nav/NavDrawer.tsx
'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { usePathname } from 'next/navigation'

const PROJECT_HEALTH = [
  { label: 'Dashboard', href: '/' },
  { label: 'Insights', href: '/insights' },
  { label: 'Git', href: '/git-activity' },
  { label: 'Usage', href: '/usage' },
  { label: 'Compare', href: '/compare' },
  { label: 'Tech Audit', href: '/tech-audit' },
  { label: 'Timeline', href: '/timeline' },
  { label: 'Kanban', href: '/kanban' },
]

const TOOLS = [
  { label: 'Memory', href: '/memory' },
  { label: 'Context', href: '/context' },
  { label: 'Search', href: '/search' },
  { label: 'Bookmarks', href: '/bookmarks' },
  { label: 'Templates', href: '/templates' },
]

type NavDrawerProps = {
  isOpen: boolean
  onClose: () => void
}

export function NavDrawer({ isOpen, onClose }: NavDrawerProps) {
  const pathname = usePathname()

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-64 bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Tools</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <X size={14} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-1.5">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Project Health</p>
            {PROJECT_HEALTH.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block px-2 py-1.5 rounded text-sm transition-colors ${
                  (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="px-3 py-1.5 mt-2">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Tools</p>
            {TOOLS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`block px-2 py-1.5 rounded text-sm transition-colors ${
                  pathname.startsWith(item.href)
                    ? 'bg-violet-500/20 text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}
```

**Step 2: Wire NavDrawer into the dashboard layout**

In `app/(dashboard)/layout.tsx`:
- Add `import { NavDrawer } from '@/components/nav/NavDrawer'`
- Add `const [showDrawer, setShowDrawer] = useState(false)` to state
- Pass `onDrawerToggle={() => setShowDrawer(p => !p)}` and `isDrawerOpen={showDrawer}` to `<TopNav>`
- Add `<NavDrawer isOpen={showDrawer} onClose={() => setShowDrawer(false)} />` before the closing `</div>`

The relevant section in `layout.tsx` becomes:
```tsx
// Add to imports
import { NavDrawer } from '@/components/nav/NavDrawer'

// Add to state (alongside showQuickCapture etc.)
const [showDrawer, setShowDrawer] = useState(false)

// Updated TopNav call
<TopNav
  onAssistantToggle={assistant.toggle}
  isAssistantOpen={assistant.isOpen}
  onDrawerToggle={() => setShowDrawer(p => !p)}
  isDrawerOpen={showDrawer}
/>

// Add before closing </div> of FocusProvider
<NavDrawer isOpen={showDrawer} onClose={() => setShowDrawer(false)} />
```

**Step 3: Verify drawer works**

Run: `npm run dev`
Expected: Clicking `[☰]` in the top-right opens a right-side drawer with "Project Health" and "Tools" sections. Clicking outside or pressing Escape closes it. Clicking any link navigates and closes the drawer.

**Step 4: Commit**

```bash
git add components/nav/NavDrawer.tsx app/(dashboard)/layout.tsx
git commit -m "feat: add NavDrawer — right sidebar with secondary nav items"
```

---

### Task 3: Create project-scoped route layout

**Files:**
- Create: `app/(dashboard)/projects/[projectId]/layout.tsx`

This layout syncs the URL's `projectId` to the `ProjectProvider` context. It runs after the dashboard layout, so `useProjectStore` is available. On mount (and when `projectId` changes), it calls `openProject()` with the matching project. If the project ID is not found in the projects list, it opens the `ProjectSwitcherModal`.

**Step 1: Create the directory**

```bash
mkdir -p app/(dashboard)/projects/\[projectId\]
```

**Step 2: Create the layout**

```tsx
// app/(dashboard)/projects/[projectId]/layout.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import type { Project } from '@/hooks/useProjects'

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: projects = [], isLoading } = useProjects()
  const { openProject, selectedProject } = useProjectStore()
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (isLoading) return
    const project = projects.find(p => p.id === projectId)
    if (project) {
      openProject(project)
      setShowSelector(false)
    } else {
      setShowSelector(true)
    }
  }, [projectId, projects, isLoading, openProject])

  return (
    <>
      {children}
      {showSelector && (
        <ProjectSwitcherModal
          onSelect={(p: Project) => { openProject(p); setShowSelector(false) }}
          onClose={() => setShowSelector(false)}
          openProjectIds={[]}
        />
      )}
    </>
  )
}
```

**Step 3: Verify layout mounts**

Create a temporary test file `app/(dashboard)/projects/[projectId]/page.tsx`:
```tsx
export default function ProjectIndexPage() {
  return <p className="text-zinc-400 text-sm p-4">Project root</p>
}
```

Navigate to `http://localhost:3000/projects/some-valid-project-id` in the browser. Expected: Layout syncs the project and renders content. Navigate to an invalid ID — expected: `ProjectSwitcherModal` opens.

**Step 4: Commit**

```bash
git add "app/(dashboard)/projects/[projectId]/layout.tsx" "app/(dashboard)/projects/[projectId]/page.tsx"
git commit -m "feat: project-scoped route layout — syncs URL projectId to project store"
```

---

### Task 4: Move workflow pages to project-scoped routes

**Files:**
- Create: `app/(dashboard)/projects/[projectId]/ideas/page.tsx`
- Create: `app/(dashboard)/projects/[projectId]/specs/page.tsx`
- Create: `app/(dashboard)/projects/[projectId]/plans/page.tsx`
- Create: `app/(dashboard)/projects/[projectId]/developing/page.tsx`

All four existing workflow pages already use `useProjectStore().selectedProject` and need zero logic changes. They are moved as-is into the new project-scoped route.

**Step 1: Copy ideas page**

Copy the full content of `app/(dashboard)/ideas/page.tsx` to `app/(dashboard)/projects/[projectId]/ideas/page.tsx` unchanged.

**Step 2: Copy specs page**

Copy the full content of `app/(dashboard)/specs/page.tsx` to `app/(dashboard)/projects/[projectId]/specs/page.tsx` unchanged.

**Step 3: Copy plans page**

Copy the full content of `app/(dashboard)/plans/page.tsx` to `app/(dashboard)/projects/[projectId]/plans/page.tsx` unchanged.

**Step 4: Copy developing page**

Copy the full content of `app/(dashboard)/developing/page.tsx` to `app/(dashboard)/projects/[projectId]/developing/page.tsx` unchanged.

**Step 5: Verify all four routes work**

Run: `npm run dev`
Select a project via the project tabs. Navigate to:
- `http://localhost:3000/projects/[your-project-id]/ideas` — expected: Ideas page loads with project's idea files
- `http://localhost:3000/projects/[your-project-id]/specs` — expected: Specs page loads
- `http://localhost:3000/projects/[your-project-id]/plans` — expected: Plans page loads
- `http://localhost:3000/projects/[your-project-id]/developing` — expected: Developing view loads

**Step 6: Commit**

```bash
git add "app/(dashboard)/projects"
git commit -m "feat: move workflow pages to project-scoped routes"
```

---

### Task 5: Create project-scoped Reports page

**Files:**
- Create: `app/(dashboard)/projects/[projectId]/reports/page.tsx`

This replaces `sessions/page.tsx`. The content is adapted to only show sessions for the current project (instead of all projects). The orchestrator feed remains on the side.

**Step 1: Create the reports page**

```tsx
// app/(dashboard)/projects/[projectId]/reports/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSessions } from '@/hooks/useSessions'
import { useProjectStore } from '@/hooks/useProjects'
import { SessionCard } from '@/components/SessionCard'
import { OrchestratorFeed } from '@/components/OrchestratorFeed'
import type { OrchestratorDecision } from '@/lib/orchestrator-types'

function useDecisions() {
  const [decisions, setDecisions] = useState<OrchestratorDecision[]>([])
  useEffect(() => {
    const es = new EventSource('/api/sse/decisions')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { decisions: OrchestratorDecision[] }
        setDecisions(prev => {
          const ids = new Set(prev.map(d => d.id))
          const newOnes = data.decisions.filter(d => !ids.has(d.id))
          return [...newOnes, ...prev].slice(0, 50)
        })
      } catch {}
    }
    return () => es.close()
  }, [])
  return decisions
}

function useOrchestrators() {
  return useQuery<{ orchestrators: Array<{ id: string; project_id: string; status: string }> }>({
    queryKey: ['orchestrators'],
    queryFn: () => fetch('/api/orchestrators').then(r => r.json()),
    refetchInterval: 10000,
  })
}

export default function ReportsPage() {
  const { selectedProject } = useProjectStore()
  const { data: allSessions = [] } = useSessions({ status: 'all' })
  const { data: orchData } = useOrchestrators()
  const decisions = useDecisions()

  const sessions = selectedProject
    ? allSessions.filter(s => s.project_id === selectedProject.id)
    : []

  const orch = selectedProject
    ? (orchData?.orchestrators ?? []).find(o => o.project_id === selectedProject.id)
    : undefined

  const activeCount = sessions.filter(s => s.status === 'active').length

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold text-zinc-100">Reports</h1>
          <span className="text-xs text-zinc-500">{activeCount} active</span>
          {orch && orch.status === 'active' && (
            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">🤖 orchestrator</span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ alignItems: 'stretch' }}>
          {sessions.map(s => {
            const latestDecision = selectedProject
              ? decisions.find(d => d.project_id === selectedProject.id && d.source_file === s.source_file) ?? null
              : null
            return <SessionCard key={s.id} session={s} latestDecision={latestDecision} />
          })}
        </div>
        {sessions.length === 0 && (
          <div className="text-zinc-600 text-sm text-center py-10">
            No sessions yet. Start a session from the Plans page.
          </div>
        )}
      </div>
      <OrchestratorFeed decisions={decisions} />
    </div>
  )
}
```

**Step 2: Verify**

Navigate to `http://localhost:3000/projects/[your-project-id]/reports`.
Expected: Shows sessions filtered to the current project only.

**Step 3: Commit**

```bash
git add "app/(dashboard)/projects/[projectId]/reports/page.tsx"
git commit -m "feat: add project-scoped Reports page (replaces global Sessions)"
```

---

### Task 6: Update root page — redirect to last active project

**Files:**
- Modify: `app/(dashboard)/page.tsx`

The root `/` previously showed the dashboard overview. Now it should redirect to the last active project's ideas page, or open the project selector if none.

**Step 1: Read the current root page**

Open `app/(dashboard)/page.tsx` to understand what it currently renders.

**Step 2: Replace with redirect logic**

```tsx
// app/(dashboard)/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'
import type { Project } from '@/hooks/useProjects'

export default function RootPage() {
  const { selectedProject, openProject } = useProjectStore()
  const router = useRouter()
  const [showSelector, setShowSelector] = useState(false)

  useEffect(() => {
    if (selectedProject) {
      router.replace(`/projects/${selectedProject.id}/ideas`)
    } else {
      setShowSelector(true)
    }
  }, [selectedProject, router])

  if (!showSelector) return null

  return (
    <ProjectSwitcherModal
      onSelect={(p: Project) => {
        openProject(p)
        router.push(`/projects/${p.id}/ideas`)
      }}
      onClose={() => setShowSelector(false)}
      openProjectIds={[]}
    />
  )
}
```

**Step 3: Verify**

Navigate to `http://localhost:3000/`.
- With a previously selected project: expected redirect to `/projects/[id]/ideas`
- With no project in localStorage: expected `ProjectSwitcherModal` opens

**Step 4: Commit**

```bash
git add "app/(dashboard)/page.tsx"
git commit -m "feat: root page redirects to last active project or shows selector"
```

---

### Task 7: Update ProjectTabs — tab click navigates to project URL

**Files:**
- Modify: `components/nav/ProjectTabs.tsx`

Clicking a tab should navigate to `/projects/[p.id]/ideas` (or preserve the current workflow page if already in a project route). Use `usePathname()` to detect the current workflow page segment.

**Step 1: Update ProjectTabs**

```tsx
'use client'
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useProjectStore, type Project } from '@/hooks/useProjects'
import { ProjectSwitcherModal } from '@/components/ProjectSwitcherModal'

const WORKFLOW_SLUGS = ['ideas', 'specs', 'plans', 'developing', 'reports']

export function ProjectTabs() {
  const { openProjects, activeProjectId, openProject, closeProject } = useProjectStore()
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  // Detect current workflow page to preserve it when switching projects
  const currentSlug = WORKFLOW_SLUGS.find(s => pathname.includes(`/${s}`)) ?? 'ideas'

  const handleSelect = (p: Project) => {
    openProject(p)
    router.push(`/projects/${p.id}/${currentSlug}`)
  }

  return (
    <>
      <div className="flex items-center border-b border-zinc-800 bg-zinc-950 overflow-x-auto min-h-[34px]">
        {openProjects.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-3 h-[34px] cursor-pointer whitespace-nowrap select-none group transition-colors border-r border-zinc-800 ${
              p.id === activeProjectId
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
            }`}
            onClick={() => handleSelect(p)}
          >
            <span className="text-xs">{p.name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeProject(p.id) }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 rounded p-0.5 hover:bg-zinc-600 transition-opacity"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-2 flex items-center h-[34px] text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          title="Open project (Ctrl+P)"
        >
          <Plus size={14} />
        </button>
      </div>
      {modalOpen && (
        <ProjectSwitcherModal
          onSelect={(p: Project) => { handleSelect(p); setModalOpen(false) }}
          onClose={() => setModalOpen(false)}
          openProjectIds={openProjects.map((p) => p.id)}
        />
      )}
    </>
  )
}
```

**Step 2: Verify tab navigation**

Open two projects via the `+` button. Click between tabs while on `/projects/[id]/plans`.
Expected: switching tabs navigates to `/projects/[other-id]/plans`, preserving the plans context.

**Step 3: Commit**

```bash
git add components/nav/ProjectTabs.tsx
git commit -m "feat: ProjectTabs navigates to project-scoped URL on tab switch"
```

---

### Task 8: Update command palette — project-aware nav commands

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

Update the `Navigate` commands in `useMemo` to use `/projects/[selectedProject.id]/...` routes. Pass `selectedProject` into the memo deps.

**Step 1: Update the commands memo in layout.tsx**

Find the `const commands: Command[] = useMemo(...)` block and update the workflow navigation entries:

```tsx
// Add to existing imports at top
// (useProjectStore is already available via useProjects import — add it if not present)
import { useProjects, useProjectStore } from '@/hooks/useProjects'

// Inside DashboardLayout component, add:
const { selectedProject } = useProjectStore()

// Update the commands useMemo — replace the nav commands:
const commands: Command[] = useMemo(() => {
  const projectBase = selectedProject ? `/projects/${selectedProject.id}` : null
  const cmds: Command[] = [
    { id: 'nav-ideas', label: 'Go to Ideas', group: 'Navigate', action: () => projectBase && router.push(`${projectBase}/ideas`) },
    { id: 'nav-specs', label: 'Go to Specs', group: 'Navigate', action: () => projectBase && router.push(`${projectBase}/specs`) },
    { id: 'nav-plans', label: 'Go to Plans', group: 'Navigate', action: () => projectBase && router.push(`${projectBase}/plans`) },
    { id: 'nav-developing', label: 'Go to In Development', group: 'Navigate', action: () => projectBase && router.push(`${projectBase}/developing`) },
    { id: 'nav-reports', label: 'Go to Reports', group: 'Navigate', action: () => projectBase && router.push(`${projectBase}/reports`) },
    { id: 'nav-memory', label: 'Go to Memory', group: 'Navigate', action: () => router.push('/memory') },
    { id: 'nav-settings', label: 'Go to Settings', group: 'Navigate', action: () => router.push('/settings') },
  ]
  for (const p of projects) {
    cmds.push({
      id: `project-${p.id}`,
      label: `Switch to: ${p.name}`,
      group: 'Projects',
      keywords: [p.name, p.path],
      action: () => { openProject(p); router.push(`/projects/${p.id}/ideas`) },
    })
  }
  return cmds
}, [projects, openProject, router, selectedProject])
```

**Step 2: Verify**

Open command palette (Cmd+K). Type "Ideas".
Expected: "Go to Ideas" navigates to `/projects/[active-id]/ideas`. "Switch to: [project]" navigates to that project's ideas page.

**Step 3: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: command palette uses project-scoped routes"
```

---

### Task 9: Remove old flat workflow routes

**Files:**
- Delete: `app/(dashboard)/ideas/page.tsx`
- Delete: `app/(dashboard)/specs/page.tsx`
- Delete: `app/(dashboard)/plans/page.tsx`
- Delete: `app/(dashboard)/developing/page.tsx`
- Delete: `app/(dashboard)/sessions/page.tsx`

**Step 1: Delete the old pages**

```bash
rm app/\(dashboard\)/ideas/page.tsx
rm app/\(dashboard\)/specs/page.tsx
rm app/\(dashboard\)/plans/page.tsx
rm app/\(dashboard\)/developing/page.tsx
rm app/\(dashboard\)/sessions/page.tsx
```

**Step 2: Remove the now-empty directories**

```bash
rmdir app/\(dashboard\)/ideas app/\(dashboard\)/specs app/\(dashboard\)/plans app/\(dashboard\)/developing app/\(dashboard\)/sessions
```

**Step 3: Verify no broken imports or references**

Run: `npm run build`
Expected: Build succeeds with no errors. Any TypeScript errors about missing modules must be fixed before proceeding.

**Step 4: Smoke test the full flow**

Run: `npm run dev`
- Visit `/` — redirects to active project's ideas page
- Click each workflow nav item — all load correctly
- Click the `[☰]` button — drawer opens with secondary tools
- Switch projects via tabs — stays on current workflow page
- Open command palette — workflow commands navigate correctly

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove old flat workflow routes — all workflow pages now project-scoped"
```
