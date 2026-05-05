import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BriefingPage } from '../BriefingPage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useBriefing', () => ({
  useBriefing: vi.fn(),
}))
import { useBriefing } from '@/hooks/useBriefing'

describe('BriefingPage', () => {
  it('renders loading state', () => {
    vi.mocked(useBriefing).mockReturnValue({ data: undefined, isLoading: true, error: undefined } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders error state', () => {
    vi.mocked(useBriefing).mockReturnValue({ data: undefined, isLoading: false, error: new Error('boom') } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
  })

  it('renders all-clear empty state when totals are 0', () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: {
        openNextActions: [], criticFlagged: [], topTasks: [], recentFailures: [], duplicateTasks: [],
        generatedAt: '2026-05-05T00:00:00.000Z',
      },
      isLoading: false, error: undefined,
    } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/all clear/i)).toBeInTheDocument()
  })

  it('renders sections when items exist', () => {
    vi.mocked(useBriefing).mockReturnValue({
      data: {
        openNextActions: [{
          sessionId: 's1', sessionLabel: 'Spec session', projectId: 'p1', projectName: 'Test',
          taskId: 't1', sourceFile: null, endedAt: '2026-05-04T00:00:00.000Z', actions: ['do X'], openQuestions: [],
        }],
        criticFlagged: [], topTasks: [], recentFailures: [], duplicateTasks: [],
        generatedAt: '2026-05-05T00:00:00.000Z',
      },
      isLoading: false, error: undefined,
    } as never)
    render(<BriefingPage />)
    expect(screen.getByText(/open next steps/i)).toBeInTheDocument()
    expect(screen.getByText(/spec session/i)).toBeInTheDocument()
    expect(screen.getByText(/do x/i)).toBeInTheDocument()
  })
})
