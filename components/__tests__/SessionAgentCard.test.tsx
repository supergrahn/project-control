import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionAgentCard } from '../dashboard/SessionAgentCard'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

vi.mock('@/hooks/useRouterDecision', () => ({
  useRouterDecision: vi.fn(() => ({ data: { decision: null } })),
}))

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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <SessionWindowProvider>{children}</SessionWindowProvider>
    </QueryClientProvider>
  )
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

  it('does not parse pill from multi-line text with tool name on a later line', () => {
    const multiLineEntry = {
      id: 'e3', sessionId: 'sess-1', label: 'Redesign', phase: 'spec',
      text: 'Some output\nWrite · should-not-match.tsx',
      timestamp: '2026-03-31T08:02:00Z',
    }
    render(
      <SessionAgentCard session={mockSession} feedEntries={[multiLineEntry]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    // Should NOT find a WRITE pill since Write is not on the first line
    expect(screen.queryByText('WRITE')).not.toBeInTheDocument()
    // Should show waiting state
    expect(screen.getByText('Waiting for tool calls…')).toBeInTheDocument()
  })
})

describe('SessionAgentCard — todo progress pill', () => {
  const todoEntry = {
    id: 'e3', sessionId: 'sess-1', label: 'Redesign', phase: 'spec',
    text: 'TodoWrite · [{"id":"1","content":"Write tests","status":"completed"},{"id":"2","content":"Deploy","status":"in_progress"},{"id":"3","content":"Review","status":"pending"}]',
    timestamp: '2026-04-01T08:02:00Z',
  }

  it('shows "1 / 3" when one of three todos is completed', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={[todoEntry]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('hides progress pill when no TodoWrite in feed', () => {
    render(
      <SessionAgentCard session={mockSession} feedEntries={mockFeedEntries} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument()
  })
})

describe('SessionAgentCard — router integration', () => {
  const decision = {
    id: 'd1',
    picked_provider: 'p-claude',
    phase: 'develop',
    complexity: 'normal',
    score_breakdown: {
      suitability: 0.9,
      cost: 0.5,
      success_rate_blended: 0.85,
      n_observed: 0,
      total: 1.62,
      considered: [
        { providerId: 'p-claude', providerName: 'Claude', score: 1.62 },
        { providerId: 'p-codex', providerName: 'Codex', score: 1.40 },
      ],
    },
  }

  it('renders the via-router badge when an auto-router decision exists', async () => {
    const { useRouterDecision } = await import('@/hooks/useRouterDecision')
    vi.mocked(useRouterDecision).mockReturnValueOnce({ data: { decision } } as ReturnType<typeof useRouterDecision>)
    render(
      <SessionAgentCard session={mockSession} feedEntries={[]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByText(/via router/i)).toBeInTheDocument()
    // Considered list is rendered (visibility toggled by group hover, but DOM is present).
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  it('does not render the via-router badge for manual_retry decisions (no considered list)', async () => {
    const { useRouterDecision } = await import('@/hooks/useRouterDecision')
    // manual_retry decisions have no `considered` array on score_breakdown
    const manual = {
      ...decision,
      score_breakdown: { ...decision.score_breakdown, considered: undefined },
    }
    vi.mocked(useRouterDecision).mockReturnValueOnce({
      data: { decision: manual },
    } as ReturnType<typeof useRouterDecision>)
    render(
      <SessionAgentCard session={mockSession} feedEntries={[]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.queryByText(/via router/i)).not.toBeInTheDocument()
  })

  it('auto-opens the RouteRetryDialog when status is needs_route_retry and a decision is loaded', async () => {
    const { useRouterDecision } = await import('@/hooks/useRouterDecision')
    vi.mocked(useRouterDecision).mockReturnValueOnce({ data: { decision } } as ReturnType<typeof useRouterDecision>)
    const failedSession = {
      ...mockSession,
      status: 'needs_route_retry',
      exit_reason: 'adapter_spawn_failed: ENOENT claude',
    }
    render(
      <SessionAgentCard session={failedSession} feedEntries={[]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.getByRole('dialog', { name: /session start failed/i })).toBeInTheDocument()
    expect(screen.getByText(/adapter_spawn_failed/i)).toBeInTheDocument()
    // Failed-route entry is hidden from alternatives, the other route is offered.
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument()
  })

  it('does not open the dialog when the session is active', async () => {
    const { useRouterDecision } = await import('@/hooks/useRouterDecision')
    vi.mocked(useRouterDecision).mockReturnValueOnce({ data: { decision } } as ReturnType<typeof useRouterDecision>)
    render(
      <SessionAgentCard session={mockSession} feedEntries={[]} onStop={mockOnStop} onOpenTerminal={mockOnOpenTerminal} />,
      { wrapper }
    )
    expect(screen.queryByRole('dialog', { name: /session start failed/i })).not.toBeInTheDocument()
  })
})
