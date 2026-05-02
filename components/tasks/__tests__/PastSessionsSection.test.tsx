import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/hooks/useSessions'

const pushSpy = vi.fn()
let mockSessions: Session[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))
vi.mock('@/hooks/useSessions', () => ({
  useSessions: () => ({ data: mockSessions, isLoading: false }),
  useKillSession: () => ({ mutate: vi.fn() }),
}))

import { PastSessionsSection } from '../PastSessionsSection'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 's1', project_id: 'proj-1', label: 'Build feature', phase: 'developing',
  source_file: null, status: 'ended', created_at: '2026-05-02T10:00:00.000Z',
  ended_at: '2026-05-02T11:00:00.000Z', task_id: 'task-1', summary: 'wrap-up text',
}

describe('PastSessionsSection', () => {
  it('renders ended sessions for the task', () => {
    mockSessions = [baseSession]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText('wrap-up text')).toBeInTheDocument()
  })

  it('hides active sessions (no ended_at)', () => {
    mockSessions = [{ ...baseSession, ended_at: null, status: 'active' }]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.queryByText('Build feature')).not.toBeInTheDocument()
    expect(screen.getByText('No past sessions yet.')).toBeInTheDocument()
  })

  it('shows fallback when summary is null', () => {
    mockSessions = [{ ...baseSession, summary: null }]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('No final message captured.')).toBeInTheDocument()
  })

  it('clicking a card navigates to /sessions?selected=', () => {
    mockSessions = [baseSession]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    pushSpy.mockClear()
    fireEvent.click(screen.getByText('Build feature').closest('[role="button"]')!)
    expect(pushSpy).toHaveBeenCalledWith('/sessions?selected=s1')
  })

  it('only shows sessions for THIS task', () => {
    mockSessions = [
      baseSession,
      { ...baseSession, id: 's2', label: 'Other task work', task_id: 'task-2' },
    ]
    wrap(<PastSessionsSection projectId="proj-1" taskId="task-1" />)
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.queryByText('Other task work')).not.toBeInTheDocument()
  })
})
