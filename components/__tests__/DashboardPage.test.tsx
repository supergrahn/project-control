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
