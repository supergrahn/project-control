import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BriefingPage } from '../BriefingPage'
import { ProjectPicker } from '../ProjectPicker'
import { BriefingHero } from '../BriefingHero'

const mockReplace = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useBriefing', () => ({
  useBriefing: vi.fn(),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'Project 1' }] }),
}))

import { useBriefing } from '@/hooks/useBriefing'

const baseData = {
  openNextActions: [],
  criticFlagged: [],
  topTasks: [],
  recentFailures: [],
  duplicateTasks: [],
  generatedAt: '2026-05-05T00:00:00.000Z',
  snapshot: null,
  snapshotStale: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useBriefing).mockReturnValue({
    data: baseData,
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  } as never)
})

describe('BriefingPage', () => {
  it('renders loading state', () => {
    vi.mocked(useBriefing).mockReturnValue({ data: undefined, isLoading: true, error: undefined, mutate: vi.fn() } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders error state', () => {
    vi.mocked(useBriefing).mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom'), mutate: vi.fn() } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('renders all-clear empty state when totals are 0', () => {
    render(<BriefingPage />)
    expect(screen.getByText(/all clear/i)).toBeInTheDocument()
  })

  it('renders sections when items exist', () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: {
        ...baseData,
        openNextActions: [{
          sessionId: 's1', sessionLabel: 'Spec session', projectId: 'p1', projectName: 'Test',
          taskId: 't1', sourceFile: null, endedAt: '2026-05-04T00:00:00.000Z', actions: ['do X'], openQuestions: [],
        }],
      },
      isLoading: false, error: undefined, mutate: vi.fn(),
    } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/open next steps/i)).toBeInTheDocument()
    expect(screen.getByText(/spec session/i)).toBeInTheDocument()
    expect(screen.getByText(/do x/i)).toBeInTheDocument()
  })
})

describe('ProjectPicker', () => {
  it('renders with "All projects" option and project options', () => {
    render(<ProjectPicker />)
    expect(screen.getByRole('combobox', { name: /filter briefing by project/i })).toBeInTheDocument()
    expect(screen.getByText('All projects')).toBeInTheDocument()
    expect(screen.getByText('Project 1')).toBeInTheDocument()
  })

  it('calls router.replace with ?projectId= when a project is selected', () => {
    render(<ProjectPicker />)
    const select = screen.getByRole('combobox', { name: /filter briefing by project/i })
    fireEvent.change(select, { target: { value: 'p1' } })
    expect(mockReplace).toHaveBeenCalledWith('/briefing?projectId=p1')
  })

  it('calls router.replace without projectId when "All projects" selected', () => {
    render(<ProjectPicker />)
    const select = screen.getByRole('combobox', { name: /filter briefing by project/i })
    fireEvent.change(select, { target: { value: '' } })
    expect(mockReplace).toHaveBeenCalledWith('/briefing?')
  })
})

describe('BriefingHero', () => {
  const snapshotData = {
    ...baseData,
    snapshot: {
      narrative: 'Today looks busy.',
      priorityActions: [
        { sectionKey: 'next_actions', refId: 's1', reason: 'Has open questions' },
        { sectionKey: 'top_tasks', refId: 't99', reason: 'This refId is stale' },
      ],
      model: 'gpt-test',
      generatedAt: '2026-05-05T00:00:00.000Z',
    },
    snapshotStale: false,
    openNextActions: [{ sessionId: 's1', sessionLabel: 'Test', projectId: 'p1', projectName: 'P', taskId: null, sourceFile: null, endedAt: '', actions: [], openQuestions: [] }],
    topTasks: [], // t99 not present → stale
  }

  it('renders narrative when snapshot is present', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<BriefingHero data={snapshotData} onRefresh={onRefresh} />)
    expect(screen.getByText('Today looks busy.')).toBeInTheDocument()
  })

  it('renders "Synthesizing" state when snapshot is null and stale', () => {
    const stalePendingData = { ...baseData, snapshot: null, snapshotStale: true }
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<BriefingHero data={stalePendingData} onRefresh={onRefresh} />)
    expect(screen.getByText(/synthesizing morning briefing/i)).toBeInTheDocument()
  })

  it('"Refresh now" button disables while pending', async () => {
    let resolveRefresh!: () => void
    const onRefresh = vi.fn().mockImplementation(() => new Promise<void>(res => { resolveRefresh = res }))
    render(<BriefingHero data={snapshotData} onRefresh={onRefresh} />)

    const btn = screen.getByRole('button', { name: /refresh briefing/i })
    expect(btn).not.toBeDisabled()

    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    expect(screen.getByText('Refreshing…')).toBeInTheDocument()

    act(() => resolveRefresh())
  })

  it('drops priority action whose refId is not in live section data', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<BriefingHero data={snapshotData} onRefresh={onRefresh} />)
    // 'Has open questions' corresponds to s1 which IS in openNextActions — visible
    expect(screen.getByText(/has open questions/i)).toBeInTheDocument()
    // 'This refId is stale' corresponds to t99 which is NOT in topTasks — hidden
    expect(screen.queryByText(/this refid is stale/i)).not.toBeInTheDocument()
  })
})

describe('Section action buttons', () => {
  it('Continue button in OpenNextActionsSection POSTs to /api/sessions/:id/continue', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ sessionId: 'new-s1' }) } as Response)

    vi.mocked(useBriefing).mockReturnValue({
      data: {
        ...baseData,
        openNextActions: [{
          sessionId: 's1', sessionLabel: 'Spec session', projectId: 'p1', projectName: 'Test',
          taskId: 't1', sourceFile: null, endedAt: '2026-05-04T00:00:00.000Z', actions: ['do X'], openQuestions: [],
        }],
      },
      isLoading: false, error: undefined, mutate: vi.fn(),
    } as never)

    render(<BriefingPage />)
    const btn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/sessions/s1/continue', { method: 'POST' })
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions?selected=new-s1')
    })
    fetchSpy.mockRestore()
  })

  it('Fix this button in CriticFlaggedSection POSTs to /api/critic-findings/:id/fix', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ sessionId: 'fix-s1' }) } as Response)

    vi.mocked(useBriefing).mockReturnValue({
      data: {
        ...baseData,
        criticFlagged: [{
          findingId: 42, projectId: 'p1', projectName: 'Test', kind: 'spec', ref: 'spec.md',
          severity: 'critical' as const, category: 'completeness', message: 'Missing section', createdAt: '',
        }],
      },
      isLoading: false, error: undefined, mutate: vi.fn(),
    } as never)

    render(<BriefingPage />)
    const btn = screen.getByRole('button', { name: /fix this/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/critic-findings/42/fix', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions?selected=fix-s1')
    })
    fetchSpy.mockRestore()
  })

  it('Start button in TopTasksSection POSTs to /api/tasks/:id/start', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ sessionId: 'task-s1' }) } as Response)

    vi.mocked(useBriefing).mockReturnValue({
      data: {
        ...baseData,
        topTasks: [{ taskId: 'task-1', projectId: 'p1', projectName: 'Test', title: 'Do the thing', status: 'idea', createdAt: '' }],
      },
      isLoading: false, error: undefined, mutate: vi.fn(),
    } as never)

    render(<BriefingPage />)
    const btn = screen.getByRole('button', { name: /start/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/tasks/task-1/start', { method: 'POST' })
    })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/sessions?selected=task-s1')
    })
    fetchSpy.mockRestore()
  })

  it('Dismiss button in DuplicateTasksSection POSTs to /api/dedup-dismissals', async () => {
    const mutateMock = vi.fn().mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response)

    vi.mocked(useBriefing).mockReturnValue({
      data: {
        ...baseData,
        duplicateTasks: [{
          aTaskId: 'a1', bTaskId: 'b1', aTitle: 'Task A', bTitle: 'Task B',
          projectId: 'p1', projectName: 'Test', similarity: 0.95,
        }],
      },
      isLoading: false, error: undefined, mutate: mutateMock,
    } as never)

    render(<BriefingPage />)
    const btn = screen.getByRole('button', { name: /dismiss/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/dedup-dismissals', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'p1', aTaskId: 'a1', bTaskId: 'b1' }),
      }))
    })
    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalled()
    })
    fetchSpy.mockRestore()
  })
})
