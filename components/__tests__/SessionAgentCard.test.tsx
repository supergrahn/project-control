import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
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
