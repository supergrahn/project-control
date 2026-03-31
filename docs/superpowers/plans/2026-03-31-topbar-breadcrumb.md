# TopBar Breadcrumb & Project Settings Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 38px top bar to every project page with a breadcrumb and a settings gear that opens a right-side drawer for configuring `ideas_dir`, `specs_dir`, and `plans_dir`.

**Architecture:** One new self-contained component (`TopBar`) handles breadcrumb rendering, drawer state, and the settings mutation. A `TopBarWrapper` function (matching the existing `SidebarWrapper` pattern) gates rendering on route + store state and is inserted into the layout between the `ClaudeNotFound` banner and the horizontal flex div that holds `<main>` and `<AssistantPanel>`.

**Tech Stack:** Next.js App Router (`usePathname`, `useParams`, `useRouter`), React (`useState`), `@tanstack/react-query` (`useProjects`, `useUpdateSettings`, `useProjectStore` from `hooks/useProjects.tsx`), Vitest + `@testing-library/react`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `components/layout/TopBar.tsx` | Full TopBar component: breadcrumb, gear button, settings drawer |
| Create | `components/__tests__/TopBar.test.tsx` | Unit tests for TopBar |
| Modify | `app/(dashboard)/layout.tsx` | Insert `<TopBarWrapper />` + import |

---

### Task 1: TopBar component — tests first, then implementation

**Files:**
- Create: `components/__tests__/TopBar.test.tsx`
- Create: `components/layout/TopBar.tsx`

---

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/TopBar.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TopBar } from '../layout/TopBar'

const mockMutateAsync = vi.fn().mockResolvedValue({})

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [
      {
        id: 'p1',
        name: 'project-control',
        path: '/home/user/project-control',
        ideas_dir: 'docs/ideas',
        specs_dir: 'docs/specs',
        plans_dir: 'docs/plans',
        last_used_at: null,
      },
    ],
    isLoading: false,
  }),
  useUpdateSettings: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/p1/ideas',
  useRouter: () => ({ push: vi.fn() }),
}))

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('TopBar', () => {
  beforeEach(() => {
    mockMutateAsync.mockClear()
  })

  it('renders project name in breadcrumb', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByText('project-control')).toBeInTheDocument()
  })

  it('renders "Ideas" label when pathname ends in /ideas', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByText('Ideas')).toBeInTheDocument()
  })

  it('renders "Dashboard" label when pathname is the project root', () => {
    vi.mocked(require('next/navigation').usePathname).mockReturnValue('/projects/p1')
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders gear button', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.getByLabelText('Open project settings')).toBeInTheDocument()
  })

  it('clicking gear opens settings drawer', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    expect(screen.queryByText('Project Settings')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('renders directory fields pre-populated from project data', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByDisplayValue('docs/ideas')).toBeInTheDocument()
    expect(screen.getByDisplayValue('docs/specs')).toBeInTheDocument()
    expect(screen.getByDisplayValue('docs/plans')).toBeInTheDocument()
  })

  it('clicking overlay closes drawer', () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('drawer-overlay'))
    expect(screen.queryByText('Project Settings')).not.toBeInTheDocument()
  })

  it('save button calls useUpdateSettings with correct payload', async () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        settings: { ideas_dir: 'docs/ideas', specs_dir: 'docs/specs', plans_dir: 'docs/plans' },
      })
    })
  })

  it('converts empty string to null before saving', async () => {
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    fireEvent.change(screen.getByDisplayValue('docs/ideas'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        settings: { ideas_dir: null, specs_dir: 'docs/specs', plans_dir: 'docs/plans' },
      })
    })
  })

  it('shows "Saving…" while mutation is pending', () => {
    vi.mocked(require('@/hooks/useProjects').useUpdateSettings).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    })
    render(<TopBar projectId="p1" projectName="project-control" />, { wrapper })
    fireEvent.click(screen.getByLabelText('Open project settings'))
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.getByText('Saving…')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run components/__tests__/TopBar.test.tsx
```

Expected: Multiple failures — `TopBar` does not exist yet.

- [ ] **Step 3: Create `components/layout/TopBar.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useProjects, useUpdateSettings } from '@/hooks/useProjects'
import type { Project } from '@/hooks/useProjects'

type Props = { projectId: string; projectName: string }

const PAGE_LABELS: Record<string, string> = {
  ideas: 'Ideas',
  specs: 'Specs',
  plans: 'Plans',
  developing: 'Developing',
  done: 'Done',
  reports: 'Reports',
  settings: 'Settings',
}

function getPageLabel(pathname: string, projectId: string): string {
  const prefix = `/projects/${projectId}`
  const rest = pathname.slice(prefix.length).replace(/^\//, '')
  if (!rest) return 'Dashboard'
  const segment = rest.split('/')[0]
  return PAGE_LABELS[segment] ?? (segment.charAt(0).toUpperCase() + segment.slice(1))
}

export function TopBar({ projectId, projectName }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pageLabel = getPageLabel(pathname, projectId)

  return (
    <>
      <div style={{
        height: 38,
        background: '#0c0e10',
        borderBottom: '1px solid #1c1f22',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#5a6370', fontSize: 12, fontFamily: 'inherit' }}
          >
            {projectName}
          </button>
          <span style={{ color: '#2e3338', fontSize: 12, margin: '0 6px' }}>›</span>
          <span style={{ color: '#c8ced6', fontSize: 12, fontWeight: 500 }}>{pageLabel}</span>
        </div>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open project settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', color: '#5a6370', fontSize: 14, fontFamily: 'inherit' }}
        >
          ⚙
        </button>
      </div>
      {drawerOpen && (
        <SettingsDrawer projectId={projectId} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  )
}

function SettingsDrawer({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { data: projects = [] } = useProjects()
  const project = projects.find(p => p.id === projectId) ?? null

  return (
    <>
      <div
        data-testid="drawer-overlay"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
      />
      <aside style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        background: '#141618',
        borderLeft: '1px solid #1e2124',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #1e2124', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#e2e6ea', fontSize: 14, fontWeight: 700 }}>Project Settings</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {project
            ? <SettingsForm projectId={projectId} project={project} onClose={onClose} />
            : <div style={{ color: '#5a6370', fontSize: 12 }}>Loading…</div>
          }
        </div>
      </aside>
    </>
  )
}

function SettingsForm({ projectId, project, onClose }: { projectId: string; project: Project; onClose: () => void }) {
  const mutation = useUpdateSettings()
  const [ideasDir, setIdeasDir] = useState(project.ideas_dir ?? '')
  const [specsDir, setSpecsDir] = useState(project.specs_dir ?? '')
  const [plansDir, setPlansDir] = useState(project.plans_dir ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)

  const toNullable = (v: string): string | null => v.trim() === '' ? null : v.trim()

  async function handleSave() {
    setSaveError(null)
    try {
      await mutation.mutateAsync({
        id: projectId,
        settings: {
          ideas_dir: toNullable(ideasDir),
          specs_dir: toNullable(specsDir),
          plans_dir: toNullable(plansDir),
        },
      })
      onClose()
    } catch {
      setSaveError('Failed to save settings.')
    }
  }

  const fields = [
    { label: 'Ideas directory', placeholder: 'docs/superpowers/ideas', value: ideasDir, onChange: setIdeasDir },
    { label: 'Specs directory', placeholder: 'docs/superpowers/specs', value: specsDir, onChange: setSpecsDir },
    { label: 'Plans directory', placeholder: 'docs/superpowers/plans', value: plansDir, onChange: setPlansDir },
  ]

  return (
    <>
      {fields.map(({ label, placeholder, value, onChange }) => (
        <div key={label} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#8a9199', fontSize: 12, marginBottom: 6 }}>{label}</label>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{
              width: '100%', background: '#0d0e10', border: '1px solid #1e2124',
              borderRadius: 6, padding: '7px 10px', color: '#e2e6ea', fontSize: 13,
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={mutation.isPending}
        style={{
          background: '#1c2028', color: mutation.isPending ? '#5a6370' : '#c8ced6',
          border: '1px solid #2e3338', borderRadius: 6, padding: '7px 16px',
          fontSize: 13, cursor: mutation.isPending ? 'default' : 'pointer',
          marginTop: 4, fontFamily: 'inherit',
        }}
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
      {saveError && (
        <div style={{ color: '#c04040', fontSize: 12, marginTop: 8 }}>{saveError}</div>
      )}

      <div style={{ borderTop: '1px solid #1e2124', marginTop: 24, paddingTop: 20 }}>
        {[
          { label: 'Project name', value: project.name },
          { label: 'Root path', value: project.path },
        ].map(({ label, value }) => (
          <div key={label} style={{ marginBottom: 14 }}>
            <div style={{ color: '#5a6370', fontSize: 11, marginBottom: 3 }}>{label}</div>
            <div style={{ color: '#8a9199', fontSize: 12 }}>{value}</div>
          </div>
        ))}
        <div style={{ color: '#2e3338', fontSize: 11, marginTop: 12 }}>
          To rename or move a project, update it directly in the database.
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run components/__tests__/TopBar.test.tsx
```

Expected: All tests pass. If "Dashboard" test fails, check that `usePathname` mock is being reset correctly between tests — add `vi.resetModules()` to `beforeEach` if needed.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add components/layout/TopBar.tsx components/__tests__/TopBar.test.tsx
git commit -m "feat: add TopBar component with breadcrumb and settings drawer"
```

---

### Task 2: Wire TopBarWrapper into the layout

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

---

- [ ] **Step 1: Add the import and `TopBarWrapper` function, then insert it into the JSX**

In `app/(dashboard)/layout.tsx`, add the import at the top with the other layout imports:

```typescript
import { TopBar } from '@/components/layout/TopBar'
```

Then add the `TopBarWrapper` function after the existing `SidebarWrapper` function (around line 122):

```typescript
function TopBarWrapper() {
  const params = useParams()
  const projectId = params?.projectId as string | undefined
  const { selectedProject } = useProjectStore()
  if (!projectId || !selectedProject || selectedProject.id !== projectId) return null
  return <TopBar projectId={projectId} projectName={selectedProject.name} />
}
```

Then insert `<TopBarWrapper />` into the JSX. Locate the inner `<div>` that is the right column (it has `flex: 1, flexDirection: 'column'`). The current structure inside it is:

```tsx
{claudeAvailable === false && (
  <div className="px-4 pt-3">
    <ClaudeNotFound />
  </div>
)}
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
```

Change it to:

```tsx
{claudeAvailable === false && (
  <div className="px-4 pt-3">
    <ClaudeNotFound />
  </div>
)}
<TopBarWrapper />
<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
```

- [ ] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests pass. The layout modification affects no existing tests because `TopBarWrapper` returns `null` in test contexts where `useParams` returns no `projectId`.

- [ ] **Step 3: Smoke test in the browser**

Start the dev server if not already running:

```bash
npm run dev
```

Navigate to `http://localhost:3000`. Open a project — confirm the top bar appears at 38px height with the breadcrumb and gear icon. Click the gear — confirm the drawer slides in from the right with all three directory fields pre-populated. Click outside the drawer — confirm it closes.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/layout.tsx
git commit -m "feat: insert TopBarWrapper into dashboard layout"
```
