import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@/hooks/useSessions'

const replaceSpy = vi.fn()
const pushSpy = vi.fn()
let mockSearchParams = new URLSearchParams()
let mockSessions: Session[] = []

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceSpy, push: pushSpy, back: vi.fn(), forward: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sessions',
}))

vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return {
    ...actual,
    useSessions: () => ({ data: mockSessions, isLoading: false }),
    useKillSession: () => ({ mutate: vi.fn() }),
  }
})
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project' }] }),
}))
vi.mock('@/hooks/useSessionWindows', () => ({
  useSessionWindows: () => ({ openWindow: vi.fn() }),
}))
vi.mock('@/hooks/useSessionTerminal', () => ({
  useSessionTerminal: () => ({
    termStatus: 'active', sessionState: 'active',
    sessionReason: undefined, sessionMessage: undefined, sessionProvider: undefined, retryAfter: undefined,
  }),
}))

import SessionsPage from '../page'

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const active: Session = {
  id: 'sess-1', project_id: 'proj-1', label: 'Active session', phase: 'developing',
  source_file: null, status: 'active', created_at: '2026-05-02T10:00:00.000Z', ended_at: null,
}
const ended: Session = { ...active, id: 'sess-2', label: 'Ended session', ended_at: '2026-05-02T11:00:00.000Z' }

beforeEach(() => {
  replaceSpy.mockClear()
  mockSearchParams = new URLSearchParams()
  mockSessions = [active, ended]
})

describe('SessionsPage', () => {
  it('renders only active sessions by default', () => {
    wrap(<SessionsPage />)
    expect(screen.getByText('Active session')).toBeInTheDocument()
    expect(screen.queryByText('Ended session')).not.toBeInTheDocument()
  })

  it('shows ended sessions when filter is "ended"', () => {
    mockSearchParams = new URLSearchParams('status=ended')
    wrap(<SessionsPage />)
    expect(screen.queryByText('Active session')).not.toBeInTheDocument()
    expect(screen.getByText('Ended session')).toBeInTheDocument()
  })

  it('shows all sessions when filter is "all"', () => {
    mockSearchParams = new URLSearchParams('status=all')
    wrap(<SessionsPage />)
    expect(screen.getByText('Active session')).toBeInTheDocument()
    expect(screen.getByText('Ended session')).toBeInTheDocument()
  })

  it('clicking a filter pill calls router.replace with new status', () => {
    wrap(<SessionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /all/i }))
    expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining('status=all'))
  })

  it('clicking a card sets ?selected= via router.replace', () => {
    wrap(<SessionsPage />)
    fireEvent.click(screen.getByText('Active session').closest('[role="button"]')!)
    expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining('selected=sess-1'))
  })

  it('opens drawer when ?selected= matches a visible session', () => {
    mockSearchParams = new URLSearchParams('selected=sess-1')
    wrap(<SessionsPage />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not open drawer when ?selected= matches nothing visible', () => {
    mockSearchParams = new URLSearchParams('selected=nonexistent')
    wrap(<SessionsPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows active-filter empty-state copy', () => {
    mockSessions = []
    wrap(<SessionsPage />)
    expect(screen.getByText(/No active sessions yet/i)).toBeInTheDocument()
  })
})
