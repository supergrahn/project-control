# Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 44px project icon rail to the left of the sidebar for fast project switching, and replace `NewProjectModal` with a 4-step wizard (Project → Agent → Task → Launch).

**Architecture:** `ProjectRail` is a new standalone client component placed to the left of `SidebarWrapper` in the dashboard layout; it reads from the already-loaded `useProjects()` query and writes via `useProjectStore()`. `NewProjectWizard` is a centered modal overlay that replaces `NewProjectModal` everywhere; it owns all multi-step form state internally and fires API calls sequentially on the final step. `Sidebar` loses its Projects section (moved to rail) and its `NewProjectModal` dependency (replaced by `NewProjectWizard`). The dashboard layout outer div gains `flexDirection: row` to accommodate the new leftmost column.

**Tech Stack:** Next.js App Router, React, @tanstack/react-query, inline styles, Vitest

---

## Critical Implementation Notes

- `DOT_COLORS = ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']` is defined in `components/layout/Sidebar.tsx` (line 27). Export it from there so `ProjectRail` can import it rather than duplicating the array.
- `Task` schema in `lib/db/tasks.ts` has no `priority` column. The wizard Step 3 priority selector stores the value as a prefix in `notes` (e.g. `"[High] <description>"`). Do not attempt to POST a `priority` field to `POST /api/tasks` — it is silently ignored; embed it in the `notes` body instead.
- `POST /api/sessions` requires `{ projectId, phase }` — there is no `agentId` parameter in the current sessions API. The "Start now" button sends `{ projectId, phase: 'develop' }`. The agent association from Step 2 is informational in the summary card only; no agent-to-session binding is wired in this track.
- `GET /api/providers` is a Track B deliverable. In Step 2 of the wizard, call this endpoint and gracefully handle a 404 (show the "No providers configured" message identically to an empty response).
- `POST /api/agents` is a Track B deliverable. In Step 4 "Create & Open" / "Start now", skip the agent POST if the endpoint does not yet exist (catch the error, continue to task and navigation). The wizard must not hard-fail on missing Track B APIs.
- Two data-fetching libraries coexist: SWR (`useTasks`) and @tanstack/react-query (`useProjects`, `useAddProject`). Do not migrate either. The wizard uses `useAddProject()` from `@/hooks/useProjects`.
- `SidebarWrapper` in the layout renders `null` when there is no active project (line 129 of layout.tsx). `ProjectRail` must always render regardless — it is not gated by project selection. Place `<ProjectRail />` outside of `SidebarWrapper`.
- Sidebar tests (`components/__tests__/Sidebar.test.tsx`) currently assert that `'project-control'` and `'other-repo'` are visible and that `+ Add Project` is present. These tests must be updated as part of Task 4 to reflect the Projects section removal.
- Read `node_modules/next/dist/docs/` for any navigation or routing APIs before writing router code — this Next.js version may differ from training data.

---

## File Map

| Action | File |
|--------|------|
| Modify | `components/layout/Sidebar.tsx` — export `DOT_COLORS`; remove Projects section; replace `NewProjectModal` with `NewProjectWizard` |
| Delete | `components/projects/NewProjectModal.tsx` |
| Create | `components/layout/ProjectRail.tsx` |
| Create | `components/projects/NewProjectWizard.tsx` |
| Modify | `app/(dashboard)/layout.tsx` — insert `<ProjectRail />` left of `<SidebarWrapper />` |
| Modify | `components/__tests__/Sidebar.test.tsx` — update assertions post-restructure |
| Delete | `components/__tests__/NewProjectModal.test.tsx` |
| Create | `components/__tests__/ProjectRail.test.tsx` |
| Create | `components/__tests__/NewProjectWizard.test.tsx` |

---

## Task 1 — Export `DOT_COLORS` from Sidebar and wire `NewProjectWizard`

**Files:**
- Modify: `components/layout/Sidebar.tsx`

This task makes `DOT_COLORS` importable by `ProjectRail` and swaps the modal import so the Sidebar compiles after `NewProjectModal` is deleted. The Projects section block is removed here. This task must run before Tasks 2 and 3 so the constants are available.

- [ ] **Step 1: Change `DOT_COLORS` declaration to a named export**

  In `components/layout/Sidebar.tsx` at line 27, change:
  ```
  const DOT_COLORS = [...]
  ```
  to:
  ```
  export const DOT_COLORS = [...]
  ```

- [ ] **Step 2: Remove the Projects section block**

  Delete lines 103–127 of `components/layout/Sidebar.tsx` — the entire `{/* Projects section */}` div containing the `SectionLabel` and `allProjects.slice(0, 6).map(...)` block. Also remove the `allProjects` destructure from the `useProjects()` call on the same line if it is the only consumer of that value. Keep the `useProjects` import; `allProjects` is no longer needed in `Sidebar`.

- [ ] **Step 3: Replace `NewProjectModal` import and usage with `NewProjectWizard`**

  - Change `import { NewProjectModal } from '@/components/projects/NewProjectModal'` to `import { NewProjectWizard } from '@/components/projects/NewProjectWizard'`.
  - Rename state variable `showAddProject` to `showWizard` for clarity (or keep as-is — consistency with the wizard name is preferred).
  - Replace `{showAddProject && <NewProjectModal onClose={() => setShowAddProject(false)} />}` with `{showWizard && <NewProjectWizard onClose={() => setShowWizard(false)} />}`.
  - The `+ Add Project` button `onClick` already calls `setShowAddProject(true)` — rename to `setShowWizard(true)`.

  Note: `NewProjectWizard` does not exist yet. The file will fail to compile until Task 3 is complete. Tasks 1, 2, and 3 should be committed together, or Task 3 should be implemented first if working file-by-file.

- [ ] **Step 4: Update Sidebar tests**

  In `components/__tests__/Sidebar.test.tsx`:
  - Remove the `'renders Projects section with project names'` test (lines 55–59) — the Projects section no longer exists in the Sidebar.
  - Keep the `'renders Add Project button'` test but update mock: add `vi.mock('@/components/projects/NewProjectWizard', () => ({ NewProjectWizard: () => null }))` so the import resolves.
  - Add a new test: `'+ Add Project button opens NewProjectWizard'` — click the `+ Add Project` button and assert `NewProjectWizard` mock was rendered (check for a test-id or spy on the mock).

- [ ] **Step 5: Run Sidebar tests**

  ```bash
  npx vitest run /home/tomespen/git/project-control/components/__tests__/Sidebar.test.tsx --reporter verbose
  ```

  Expected: all tests pass (Projects section assertion removed, wizard mock resolves).

---

## Task 2 — Create `ProjectRail`

**Files:**
- Create: `components/layout/ProjectRail.tsx`
- Create: `components/__tests__/ProjectRail.test.tsx`

The rail is a fixed-width (`44px`) full-height column. It always renders, even when no project is active.

- [ ] **Step 1: Write failing tests**

  Create `components/__tests__/ProjectRail.test.tsx`:

  ```typescript
  import { render, screen, fireEvent } from '@testing-library/react'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { ProjectRail } from '../layout/ProjectRail'

  const mockPush = vi.fn()
  const mockOpenProject = vi.fn()

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useParams: () => ({ projectId: 'p1' }),
  }))

  vi.mock('@/hooks/useProjects', () => ({
    useProjects: () => ({
      data: [
        { id: 'p1', name: 'Alpha', path: '/a', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
        { id: 'p2', name: 'Beta',  path: '/b', ideas_dir: null, specs_dir: null, plans_dir: null, last_used_at: null },
      ],
    }),
    useProjectStore: () => ({
      openProject: mockOpenProject,
      activeProjectId: 'p1',
      selectedProject: null,
      openProjects: [],
      closeProject: vi.fn(),
    }),
  }))

  vi.mock('@/components/projects/NewProjectWizard', () => ({
    NewProjectWizard: ({ onClose }: { onClose: () => void }) => (
      <div data-testid="wizard" onClick={onClose} />
    ),
  }))

  function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        {children}
      </QueryClientProvider>
    )
  }

  describe('ProjectRail', () => {
    beforeEach(() => vi.clearAllMocks())

    it('renders one circle button per project with first letter', () => {
      render(<ProjectRail />, { wrapper })
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
    })

    it('active project circle has a visible ring style', () => {
      render(<ProjectRail />, { wrapper })
      const alphaBtn = screen.getByText('A').closest('button')
      expect(alphaBtn).toHaveStyle({ outline: expect.stringContaining('2px solid') })
    })

    it('clicking a project circle calls openProject and navigates', () => {
      render(<ProjectRail />, { wrapper })
      fireEvent.click(screen.getByText('A'))
      expect(mockOpenProject).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1' })
      )
      expect(mockPush).toHaveBeenCalledWith('/projects/p1')
    })

    it('+ button opens NewProjectWizard', () => {
      render(<ProjectRail />, { wrapper })
      const plusBtn = screen.getByText('+')
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
      fireEvent.click(plusBtn)
      expect(screen.getByTestId('wizard')).toBeInTheDocument()
    })

    it('closing wizard hides it', () => {
      render(<ProjectRail />, { wrapper })
      fireEvent.click(screen.getByText('+'))
      fireEvent.click(screen.getByTestId('wizard'))
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npx vitest run /home/tomespen/git/project-control/components/__tests__/ProjectRail.test.tsx --reporter verbose
  ```

  Expected: FAIL — `Cannot find module '../layout/ProjectRail'`

- [ ] **Step 3: Create `components/layout/ProjectRail.tsx`**

  Component spec:
  - `'use client'` directive at top.
  - Imports: `useState` from react; `useRouter`, `useParams` from `next/navigation`; `useProjects`, `useProjectStore` from `@/hooks/useProjects`; `DOT_COLORS` from `@/components/layout/Sidebar`; `NewProjectWizard` from `@/components/projects/NewProjectWizard`.
  - Rail container: `width: 44`, `height: '100vh'`, `background: '#0d0e10'`, `borderRight: '1px solid #1e2124'`, `display: 'flex'`, `flexDirection: 'column'`, `alignItems: 'center'`, `paddingTop: 8`, `paddingBottom: 8`, `gap: 6`, `flexShrink: 0`, `position: 'relative'`.
  - `const { data: projects = [] } = useProjects()`.
  - `const { openProject } = useProjectStore()`.
  - `const params = useParams()` — `const activeProjectId = params?.projectId as string | undefined`.
  - `const [showWizard, setShowWizard] = useState(false)`.
  - `const [tooltip, setTooltip] = useState<string | null>(null)` — tracks which project name tooltip to show.
  - For each project, render a `<button>` with:
    - `key={p.id}`
    - `onClick`: calls `openProject(p)` then `router.push(`/projects/${p.id}`)`.
    - `onMouseEnter`: sets `tooltip` to `p.name`.
    - `onMouseLeave`: sets `tooltip` to `null`.
    - Size: `width: 36, height: 36, borderRadius: '50%'`.
    - Background: `DOT_COLORS[index % 5]` at 25% opacity (`background: DOT_COLORS[i % 5] + '40'` — hex alpha `40` = 25%).
    - Text: `p.name[0].toUpperCase()`, color `DOT_COLORS[i % 5]`, `fontSize: 14`, `fontWeight: 700`.
    - Active ring: `outline: p.id === activeProjectId ? `2px solid ${DOT_COLORS[i % 5]}` : 'none'`, `outlineOffset: 2`.
    - Hover brightness: apply via `filter: 'brightness(1.3)'` using a local hover state per button, or simplify to CSS-in-JS with a `onMouseEnter`/`onMouseLeave` on the same handler that also tracks brightness.
    - Tooltip div: absolutely positioned, only rendered when `tooltip === p.name`. Position: `left: 48`, `top: 0` (relative to the rail). Style: `position: 'absolute'`, `left: 48`, `background: '#1e2124'`, `color: '#e2e6ea'`, `fontSize: 12`, `padding: '4px 8px'`, `borderRadius: 4`, `whiteSpace: 'nowrap'`, `pointerEvents: 'none'`, `zIndex: 100`.
  - Spacer `<div style={{ flex: 1 }} />` to push `+` to bottom.
  - `+` button: same 36x36 circle shape, `background: '#1e2124'`, `color: '#8a9199'`, `fontSize: 20`, `fontWeight: 300`, `onClick: () => setShowWizard(true)`.
  - Below the rail div: `{showWizard && <NewProjectWizard onClose={() => setShowWizard(false)} />}`.

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npx vitest run /home/tomespen/git/project-control/components/__tests__/ProjectRail.test.tsx --reporter verbose
  ```

  Expected: all 5 tests pass. Fix any style assertion mismatches (e.g. `outline` vs `border` — use whichever approach the test checks).

---

## Task 3 — Create `NewProjectWizard`

**Files:**
- Create: `components/projects/NewProjectWizard.tsx`
- Create: `components/__tests__/NewProjectWizard.test.tsx`

A 4-step modal wizard. Manages all step state internally. Fires creation calls only on Step 4 submit.

- [ ] **Step 1: Write failing tests**

  Create `components/__tests__/NewProjectWizard.test.tsx`:

  ```typescript
  import { render, screen, fireEvent, waitFor } from '@testing-library/react'
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { NewProjectWizard } from '../projects/NewProjectWizard'

  const mockMutateAsync = vi.fn()
  const mockPush = vi.fn()

  vi.mock('@/hooks/useProjects', () => ({
    useAddProject: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  }))
  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
  }))

  global.fetch = vi.fn()

  const validPathResponse = { ok: true, json: async () => ({ valid: true, name: 'my-repo' }) }
  const invalidPathResponse = { ok: true, json: async () => ({ valid: false, error: 'Not a git repository' }) }
  const emptyProvidersResponse = { ok: true, json: async () => [] }
  const providersResponse = { ok: true, json: async () => [{ id: 'pv1', name: 'Anthropic', is_active: 1 }] }

  describe('NewProjectWizard', () => {
    const onClose = vi.fn()

    beforeEach(() => vi.clearAllMocks())

    // --- Step indicator ---

    it('renders step indicator with Project highlighted on mount', () => {
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(emptyProvidersResponse)
      render(<NewProjectWizard onClose={onClose} />)
      expect(screen.getByText('Project')).toBeInTheDocument()
      expect(screen.getByText('Agent')).toBeInTheDocument()
      expect(screen.getByText('Task')).toBeInTheDocument()
      expect(screen.getByText('Launch')).toBeInTheDocument()
    })

    // --- Step 1: Project ---

    it('Next button is disabled until path validates', async () => {
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(invalidPathResponse)
      render(<NewProjectWizard onClose={onClose} />)
      const nextBtn = screen.getByText('Next')
      expect(nextBtn).toBeDisabled()
      const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
      fireEvent.change(pathInput, { target: { value: '/tmp' } })
      fireEvent.blur(pathInput)
      await waitFor(() => expect(screen.getByText('Not a git repository')).toBeInTheDocument())
      expect(nextBtn).toBeDisabled()
    })

    it('auto-populates name from valid path and enables Next', async () => {
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
      render(<NewProjectWizard onClose={onClose} />)
      const pathInput = screen.getByPlaceholderText('/absolute/path/to/repo')
      fireEvent.change(pathInput, { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(pathInput)
      await waitFor(() =>
        expect((screen.getByPlaceholderText('Project name') as HTMLInputElement).value).toBe('my-repo')
      )
      expect(screen.getByText('Next')).not.toBeDisabled()
    })

    // --- Step 2: Agent ---

    it('Set up later skips agent and advances to Step 3 (shown as task step)', async () => {
      ;(fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(validPathResponse)   // path validation
        .mockResolvedValueOnce(providersResponse)   // GET /api/providers
      render(<NewProjectWizard onClose={onClose} />)
      // advance past step 1
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      // now on step 2
      await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Set up later'))
      // agent skipped — step 3 should be auto-skipped, land on Launch
      await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
    })

    it('shows No providers configured when GET /api/providers returns empty', async () => {
      ;(fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(validPathResponse)
        .mockResolvedValueOnce(emptyProvidersResponse)
      render(<NewProjectWizard onClose={onClose} />)
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText(/No providers configured/)).toBeInTheDocument())
    })

    // --- Step 3: Task (agent configured) ---

    it('shows Task step when agent is configured', async () => {
      ;(fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(validPathResponse)
        .mockResolvedValueOnce(providersResponse)
      render(<NewProjectWizard onClose={onClose} />)
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      // fill agent fields
      await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
      fireEvent.click(screen.getByText('Next'))
      // should see task step
      expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument()
    })

    it('Add tasks later skips task creation', async () => {
      ;(fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(validPathResponse)
        .mockResolvedValueOnce(providersResponse)
      render(<NewProjectWizard onClose={onClose} />)
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
      fireEvent.click(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('Add tasks later')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Add tasks later'))
      expect(screen.getByText('Create & Open')).toBeInTheDocument()
    })

    // --- Step 4: Launch ---

    it('Create & Open calls addProject.mutateAsync and navigates', async () => {
      mockMutateAsync.mockResolvedValue({ id: 'new-proj' })
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
      render(<NewProjectWizard onClose={onClose} />)
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      // skip agent (so step 3 auto-skips and we land on Launch)
      await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Set up later'))
      await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Create & Open'))
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ name: 'my-repo', path: '/home/user/my-repo' })
        expect(mockPush).toHaveBeenCalledWith('/projects/new-proj')
      })
    })

    it('Start now button only visible when both agent and task are configured', async () => {
      mockMutateAsync.mockResolvedValue({ id: 'new-proj' })
      ;(fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(validPathResponse)
        .mockResolvedValueOnce(providersResponse)
        .mockResolvedValue({ ok: true, json: async () => ({ id: 'task-1' }) }) // POST /api/tasks + POST /api/agents + POST /api/sessions
      render(<NewProjectWizard onClose={onClose} />)
      // step 1
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      // step 2 — fill agent
      await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Dev' } })
      fireEvent.click(screen.getByText('Next'))
      // step 3 — fill task
      await waitFor(() => expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Fix the bug' } })
      fireEvent.click(screen.getByText('Next'))
      // step 4
      await waitFor(() => expect(screen.getByText('Start now')).toBeInTheDocument())
      expect(screen.getByText('Create & Open')).toBeInTheDocument()
    })

    it('Start now button absent when agent was skipped', async () => {
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(validPathResponse)
      render(<NewProjectWizard onClose={onClose} />)
      fireEvent.change(screen.getByPlaceholderText('/absolute/path/to/repo'), { target: { value: '/home/user/my-repo' } })
      fireEvent.blur(screen.getByPlaceholderText('/absolute/path/to/repo'))
      await waitFor(() => expect(screen.getByText('Next')).not.toBeDisabled())
      fireEvent.click(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('Set up later')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Set up later'))
      await waitFor(() => expect(screen.getByText('Create & Open')).toBeInTheDocument())
      expect(screen.queryByText('Start now')).not.toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  npx vitest run /home/tomespen/git/project-control/components/__tests__/NewProjectWizard.test.tsx --reporter verbose
  ```

  Expected: FAIL — `Cannot find module '../projects/NewProjectWizard'`

- [ ] **Step 3: Create `components/projects/NewProjectWizard.tsx`**

  Component structure:

  **State:**
  ```typescript
  type Step = 1 | 2 | 3 | 4
  // Step 1
  const [path, setPath] = useState('')
  const [name, setName] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  // Step 2
  const [agentName, setAgentName] = useState('')
  const [agentTitle, setAgentTitle] = useState('')
  const [providerId, setProviderId] = useState('')
  const [agentModel, setAgentModel] = useState('')
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [agentSkipped, setAgentSkipped] = useState(false)
  // Step 3
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDesc, setTaskDesc] = useState('')
  const [taskPriority, setTaskPriority] = useState<'Low' | 'Med' | 'High' | 'Urgent'>('Med')
  const [taskSkipped, setTaskSkipped] = useState(false)
  // Step 4
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>(1)
  ```

  **Step navigation rules:**
  - "Next" from Step 1 → Step 2, and fetch `GET /api/providers` (store in `providers`, set `providersLoaded = true`).
  - "Set up later" from Step 2 → sets `agentSkipped = true`, jumps directly to Step 4 (skipping step 3 entirely). This also implies `taskSkipped = true`.
  - "Next" from Step 2 (agent configured) → Step 3.
  - "Add tasks later" from Step 3 → sets `taskSkipped = true`, advances to Step 4.
  - "Next" from Step 3 (task configured) → Step 4.
  - Back buttons: Step 2 → Step 1, Step 3 → Step 2, Step 4 → Step 3 (or Step 2 if `agentSkipped`).

  **Step 1 render:**
  - Path input: blur calls `validatePath()` (same logic as `NewProjectModal` — `GET /api/projects/validate-path?path=...`). On valid, auto-populates name if empty.
  - Name input: editable.
  - "Next" button: disabled if `!path.trim() || !name.trim() || !!pathError || validating`.
  - "Cancel" button: calls `onClose`.

  **Step 2 render:**
  - Fetch providers on entering step (in the "Next" handler from Step 1, not a useEffect, to avoid double-fetch).
  - If `!providersLoaded`: show loading state.
  - If `providers.length === 0`: show "No providers configured" text + `<a href="/settings/providers">` link in `#5b9bd5` color.
  - Fields: Agent name (placeholder "Agent name"), Title (placeholder "e.g. Senior Developer"), Provider select dropdown (options from `providers`, empty option "Select provider"), Model (placeholder "Model (optional)").
  - "Set up later" button (left-aligned, muted style).
  - "Next" disabled if `!agentName.trim()`.
  - "Back" button.

  **Step 3 render:**
  - Fields: Task title (placeholder "Task title"), Description textarea (placeholder "Description (optional)"), Priority segmented selector (four buttons: Low / Med / High / Urgent, active button highlighted with `#5b9bd5` background).
  - "Add tasks later" button (left-aligned, muted style).
  - "Next" disabled if `!taskTitle.trim()`.
  - "Back" button.

  **Step 4 render:**
  - Summary card (surface `#141618`, border `#1e2124`, padding 16, borderRadius 8) showing:
    - Project: `name` + `path` (muted).
    - Agent: `agentName` + `providerId` if `!agentSkipped`, else "No agent".
    - Task: `taskTitle` + `[${taskPriority}]` if `!agentSkipped && !taskSkipped`, else "No task".
  - "Create & Open" button: always shown.
  - "Start now" button: only shown if `!agentSkipped && !taskSkipped`.
  - Both buttons call `handleSubmit(startNow: boolean)`.

  **`handleSubmit(startNow: boolean)`:**
  ```typescript
  setSubmitting(true)
  setSubmitError(null)
  try {
    // 1. Create project
    const project = await addProject.mutateAsync({ name: name.trim(), path: path.trim() })
    const projectId = project.id

    // 2. Create agent (if configured; swallow error if API not ready)
    let agentId: string | null = null
    if (!agentSkipped && agentName.trim()) {
      try {
        const agentRes = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            name: agentName.trim(),
            title: agentTitle.trim() || undefined,
            providerId: providerId || undefined,
            model: agentModel.trim() || undefined,
          }),
        })
        if (agentRes.ok) {
          const agentData = await agentRes.json()
          agentId = agentData.id
        }
      } catch { /* Track B not yet deployed — continue */ }
    }

    // 3. Create task (if configured)
    let taskId: string | null = null
    if (!agentSkipped && !taskSkipped && taskTitle.trim()) {
      const notesBody = `[${taskPriority}]${taskDesc.trim() ? ' ' + taskDesc.trim() : ''}`
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, title: taskTitle.trim(), notes: notesBody }),
      })
      if (taskRes.ok) {
        const taskData = await taskRes.json()
        taskId = taskData.id
      }
    }

    // 4. Spawn session (Start now only)
    if (startNow && agentId && taskId) {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, phase: 'develop' }),
      })
    }

    onClose()
    router.push(`/projects/${projectId}`)
  } catch (err) {
    setSubmitError('Failed to create project. Please try again.')
  } finally {
    setSubmitting(false)
  }
  ```

  **Modal overlay style** (same palette as `NewProjectModal`):
  - Overlay: `position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000`.
  - Dialog: `background: '#141618', border: '1px solid #1e2124', borderRadius: 10, padding: 28, width: '100%', maxWidth: 600, fontFamily: 'system-ui, sans-serif'`.
  - Click overlay to close (same pattern as `NewProjectModal`).

  **Step indicator** at top:
  - Four labels: "Project", "Agent", "Task", "Launch" separated by `›` dividers.
  - Active step: `color: '#e2e6ea', fontWeight: 700`.
  - Inactive steps: `color: '#454c54'`.

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  npx vitest run /home/tomespen/git/project-control/components/__tests__/NewProjectWizard.test.tsx --reporter verbose
  ```

  Expected: all 9 tests pass.

---

## Task 4 — Modify `app/(dashboard)/layout.tsx`

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

Insert `<ProjectRail />` to the left of `<SidebarWrapper />`. The outer flex container already has `display: 'flex'` but `flexDirection` defaults to row — make it explicit. No test file currently exists for the layout; create one.

- [ ] **Step 1: Write failing test**

  Create `app/(dashboard)/__tests__/layout.test.tsx`:

  ```typescript
  import { render, screen } from '@testing-library/react'
  import { describe, it, expect, vi } from 'vitest'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import DashboardLayout from '../layout'

  vi.mock('@/components/layout/ProjectRail', () => ({
    ProjectRail: () => <div data-testid="project-rail" />,
  }))
  vi.mock('@/components/layout/Sidebar', () => ({
    Sidebar: () => <div data-testid="sidebar" />,
  }))
  vi.mock('@/components/layout/TopBar', () => ({
    TopBar: () => <div data-testid="topbar" />,
  }))
  vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }))
  vi.mock('@/components/AssistantPanel', () => ({ AssistantPanel: () => null }))
  vi.mock('@/components/QuickCapture', () => ({ QuickCapture: () => null }))
  vi.mock('@/components/PasteModal', () => ({ PasteModal: () => null }))
  vi.mock('@/components/ShortcutGuide', () => ({ ShortcutGuide: () => null }))
  vi.mock('@/components/OrchestratorDrawer', () => ({ OrchestratorDrawer: () => null }))
  vi.mock('@/components/FloatingSessionWindow', () => ({ FloatingSessionWindow: () => null }))
  vi.mock('@/components/SessionPillBar', () => ({ SessionPillBar: () => null }))
  vi.mock('@/hooks/useSessionWindows', () => ({
    SessionWindowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSessionWindows: () => ({ windows: [], closeWindow: vi.fn(), minimizeWindow: vi.fn(), bringToFront: vi.fn(), updatePosition: vi.fn() }),
  }))
  vi.mock('@/hooks/useFocus', () => ({
    FocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }))
  vi.mock('@/hooks/useProjects', () => ({
    useProjects: () => ({ data: [] }),
    useProjectStore: () => ({ openProject: vi.fn(), selectedProject: null }),
  }))
  vi.mock('@/hooks/useAssistant', () => ({
    useAssistantPanel: () => ({ isOpen: false, close: vi.fn() }),
  }))
  vi.mock('@/hooks/useCommandPalette', () => ({
    useCommandPalette: () => ({ isOpen: false, filtered: [], query: '', setQuery: vi.fn(), close: vi.fn() }),
  }))
  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/',
    useParams: () => ({}),
  }))

  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ claudeAvailable: true }) })

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  }

  describe('DashboardLayout', () => {
    it('renders ProjectRail in the layout', () => {
      render(<DashboardLayout><div>content</div></DashboardLayout>, { wrapper })
      expect(screen.getByTestId('project-rail')).toBeInTheDocument()
    })

    it('ProjectRail appears before SidebarWrapper in the DOM', () => {
      render(<DashboardLayout><div>content</div></DashboardLayout>, { wrapper })
      const rail = screen.getByTestId('project-rail')
      // Rail should be earlier in the document than any sidebar content
      expect(document.body.innerHTML.indexOf('project-rail')).toBeLessThan(
        document.body.innerHTML.indexOf('sidebar') === -1
          ? Infinity
          : document.body.innerHTML.indexOf('sidebar')
      )
      // And the outer wrapper is a flex row
      const outerDiv = rail.closest('[style*="flex"]')
      expect(outerDiv).toBeTruthy()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  npx vitest run /home/tomespen/git/project-control/app/\(dashboard\)/__tests__/layout.test.tsx --reporter verbose
  ```

  Expected: FAIL — `project-rail` not found.

- [ ] **Step 3: Modify `app/(dashboard)/layout.tsx`**

  - Add import: `import { ProjectRail } from '@/components/layout/ProjectRail'`
  - In the JSX, the outer div at line 90 currently is:
    ```tsx
    <div style={{ display: 'flex', height: '100vh', background: '#0e1012', overflow: 'hidden' }}>
      <SidebarWrapper />
      ...
    ```
    Change to:
    ```tsx
    <div style={{ display: 'flex', flexDirection: 'row', height: '100vh', background: '#0e1012', overflow: 'hidden' }}>
      <ProjectRail />
      <SidebarWrapper />
      ...
    ```
  - `ProjectRail` is placed unconditionally — it does not check for `selectedProject`. This is intentional per spec: the rail is always visible.

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  npx vitest run /home/tomespen/git/project-control/app/\(dashboard\)/__tests__/layout.test.tsx --reporter verbose
  ```

  Expected: both tests pass.

---

## Task 5 — Delete `NewProjectModal` and its test

**Files:**
- Delete: `components/projects/NewProjectModal.tsx`
- Delete: `components/__tests__/NewProjectModal.test.tsx`

This task is the cleanup step. It must run after Tasks 1, 2, and 3 are all complete and passing — the Sidebar no longer imports `NewProjectModal`, the rail imports `NewProjectWizard`, and the wizard test file has replaced the modal test file.

- [ ] **Step 1: Confirm no remaining imports of `NewProjectModal`**

  ```bash
  grep -r "NewProjectModal" /home/tomespen/git/project-control/components /home/tomespen/git/project-control/app --include="*.tsx" --include="*.ts"
  ```

  Expected: zero results. If any remain, fix them before proceeding.

- [ ] **Step 2: Delete the files**

  ```bash
  rm /home/tomespen/git/project-control/components/projects/NewProjectModal.tsx
  rm /home/tomespen/git/project-control/components/__tests__/NewProjectModal.test.tsx
  ```

- [ ] **Step 3: Run full test suite to confirm no regressions**

  ```bash
  npx vitest run /home/tomespen/git/project-control --reporter verbose
  ```

  Expected: all tests pass. The `NewProjectModal.test.tsx` file is gone; its coverage is replaced by `NewProjectWizard.test.tsx`.

---

## Task 6 — Full integration smoke check

- [ ] **Step 1: Run the complete test suite one final time**

  ```bash
  npx vitest run /home/tomespen/git/project-control --reporter verbose
  ```

  Expected: all tests pass with no skipped tests. Pay attention to:
  - `Sidebar.test.tsx` — Projects section assertions removed, wizard mock present.
  - `ProjectRail.test.tsx` — 5 tests pass.
  - `NewProjectWizard.test.tsx` — 9 tests pass.
  - `layout.test.tsx` — 2 tests pass.
  - All pre-existing tests unaffected.

- [ ] **Step 2: Verify build compiles without type errors**

  Read `node_modules/next/dist/docs/` for the correct build command for this version before running. Do not assume `next build` is the correct invocation.

- [ ] **Step 3: Manual smoke test in browser**

  - Rail visible at all routes under `/dashboard`.
  - Clicking a project circle navigates to `/projects/{id}` and shows an active ring on that circle.
  - Clicking `+` opens the wizard overlay.
  - Wizard Step 1 validates path on blur and auto-populates name.
  - Wizard Step 2 shows providers dropdown or "No providers configured".
  - "Set up later" on Step 2 jumps directly to Step 4 (Launch), "Start now" absent.
  - With agent filled + task filled, "Start now" visible on Step 4.
  - "Create & Open" creates project and navigates.
  - Sidebar no longer shows a Projects list section.
  - Sidebar `+ Add Project` button opens the wizard (not the old modal).

---

## Build Order Summary

Tasks must be executed in this order because of import dependencies:

1. Task 3 (create `NewProjectWizard.tsx`) — required by Tasks 1 and 2 which import it.
2. Task 1 (modify `Sidebar.tsx`) — exports `DOT_COLORS`, replaces modal with wizard.
3. Task 2 (create `ProjectRail.tsx`) — imports `DOT_COLORS` from Sidebar and `NewProjectWizard`.
4. Task 4 (modify layout) — imports `ProjectRail`.
5. Task 5 (delete `NewProjectModal`) — cleanup, runs last after all imports are migrated.
6. Task 6 (smoke check) — final verification.

If using subagent-driven development, Tasks 1–3 can be dispatched as a batch to a single subagent since they form one coherent unit. Tasks 4 and 5 are independent follow-ons.
```

Now let me write this file to disk.