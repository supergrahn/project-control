import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionDetailDrawer } from '../SessionDetailDrawer'
import type { Session } from '@/hooks/useSessions'

const killMutate = vi.fn()
const openWindowSpy = vi.fn()

vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return { ...actual, useKillSession: () => ({ mutate: killMutate }) }
})
vi.mock('@/hooks/useSessionWindows', () => ({
  useSessionWindows: () => ({ openWindow: openWindowSpy }),
}))
vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project', path: '/home/user/myproject' }] }),
}))
vi.mock('@/hooks/useTasks', () => ({
  useTasks: () => ({ tasks: [{ id: 'task-1', title: 'Build feature' }], isLoading: false, error: null }),
}))
vi.mock('@/hooks/useSessionTerminal', () => ({
  useSessionTerminal: () => ({
    termStatus: 'active',
    sessionState: 'active',
    sessionReason: undefined,
    sessionMessage: undefined,
    sessionProvider: undefined,
    retryAfter: undefined,
  }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 'sess-1', project_id: 'proj-1', label: 'Build feature', phase: 'developing',
  source_file: null, status: 'active', created_at: '2026-05-02T10:00:00.000Z', ended_at: null,
}

const sessions: Session[] = [
  baseSession,
  { ...baseSession, id: 'sess-2', label: 'Other session' },
  { ...baseSession, id: 'sess-3', label: 'Third session' },
]

beforeEach(() => { killMutate.mockClear(); openWindowSpy.mockClear() })

describe('SessionDetailDrawer', () => {
  it('renders header with project name, label, and phase', () => {
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText(/developing/i)).toBeInTheDocument()
  })

  it('Pop out button calls openWindow and onClose', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /pop out/i }))
    expect(openWindowSpy).toHaveBeenCalledWith(baseSession)
    expect(onClose).toHaveBeenCalled()
  })

  it('Stop button calls kill and onClose for active sessions', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^stop$/i }))
    expect(killMutate).toHaveBeenCalledWith('sess-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('hides Stop button for ended sessions', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, ended_at: '2026-05-02T11:00:00.000Z' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    expect(screen.queryByRole('button', { name: /^stop$/i })).not.toBeInTheDocument()
  })

  it('Escape closes', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ArrowRight navigates to next session', () => {
    const onNavigate = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={vi.fn()} onNavigate={onNavigate} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onNavigate).toHaveBeenCalledWith(sessions[1])
  })

  it('ArrowLeft navigates to previous session', () => {
    const onNavigate = vi.fn()
    wrap(<SessionDetailDrawer session={sessions[1]} sessions={sessions} onClose={vi.fn()} onNavigate={onNavigate} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith(sessions[0])
  })

  it('backdrop click closes', () => {
    const onClose = vi.fn()
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={onClose} onNavigate={vi.fn()} />)
    // Backdrop is the first fixed element with bg-bg-overlay
    const backdrop = document.querySelector('.bg-bg-overlay')
    expect(backdrop).toBeTruthy()
    fireEvent.click(backdrop!)
    expect(onClose).toHaveBeenCalled()
  })

  it('renders "From <task>" link for task originator', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, task_id: 'task-1' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    // Both the session label and task title are "Build feature"; pick the anchor specifically.
    const link = screen.getByRole('link', { name: /Build feature/i })
    expect(link).toHaveAttribute('href', '/projects/proj-1/tasks/task-1')
  })

  it('renders task + doc when both task_id and source_file set', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, task_id: 'task-1', source_file: '/home/user/myproject/specs/foo.md' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    expect(screen.getByText(/via/)).toBeInTheDocument()
    expect(screen.getByText('foo.md')).toBeInTheDocument()
  })

  it('renders "From <doc>" link for doc-only originator', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, source_file: '/home/user/myproject/docs/intro.md' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    const link = screen.getByText('intro.md').closest('a')
    expect(link?.getAttribute('href')).toContain('/projects/proj-1/docs?file=')
  })

  it('renders "From standalone" without link for standalone session', () => {
    wrap(<SessionDetailDrawer
      session={baseSession}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    expect(screen.getByText(/standalone/i)).toBeInTheDocument()
  })

  it('renders "From Agent" link for agent originator', () => {
    wrap(<SessionDetailDrawer
      session={{ ...baseSession, agent_id: 'agent-1' }}
      sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()}
    />)
    const link = screen.getByRole('link', { name: /Agent/i })
    expect(link).toHaveAttribute('href', '/projects/proj-1/agents/agent-1')
  })
})
