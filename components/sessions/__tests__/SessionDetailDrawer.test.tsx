import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionDetailDrawer } from '../SessionDetailDrawer'
import type { Session } from '@/hooks/useSessions'

const killMutate = vi.fn()
const openWindowSpy = vi.fn()
const pushSpy = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}))

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

beforeEach(() => { killMutate.mockClear(); openWindowSpy.mockClear(); pushSpy.mockClear() })

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

  it('renders Next section when session.next_actions is set', () => {
    const sessionWithNext: Session = {
      ...baseSession,
      next_actions: JSON.stringify({
        next_actions: ['add tests', 'document'],
        open_questions: ['CSRF?'],
        files_touched: [{ path: 'lib/auth.ts', change: 'fixed redirect loop' }],
        extracted_at: '2026-05-02T10:00:00Z',
        model: 'qwen-3.6:9b',
      }),
    }
    wrap(<SessionDetailDrawer session={sessionWithNext} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByText(/add tests/)).toBeInTheDocument()
    expect(screen.getByText(/document/)).toBeInTheDocument()
    expect(screen.getByText(/CSRF/)).toBeInTheDocument()
    expect(screen.getByText('lib/auth.ts')).toBeInTheDocument()
    expect(screen.getByText(/fixed redirect loop/)).toBeInTheDocument()
    expect(screen.getByText(/extracted by qwen-3\.6:9b/)).toBeInTheDocument()
  })

  it('omits Next section when session.next_actions is null', () => {
    wrap(<SessionDetailDrawer session={baseSession} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByText(/^Next$/)).not.toBeInTheDocument()
  })

  it('renders Next section silently ignoring malformed JSON', () => {
    const bad: Session = { ...baseSession, next_actions: '{not-json' }
    wrap(<SessionDetailDrawer session={bad} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    // Drawer still renders without crashing; no Next heading appears.
    expect(screen.queryByText(/^Next$/)).not.toBeInTheDocument()
  })
})

describe('NextActionsSection Continue button', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sessionId: 'new-id' }), { status: 200 }),
    )
  })

  afterEach(() => { fetchSpy.mockRestore() })

  function withNextActions(extra: Partial<Session> = {}): Session {
    return {
      ...baseSession,
      next_actions: JSON.stringify({
        next_actions: ['do X'],
        open_questions: [],
        files_touched: [],
        extracted_at: 'x',
        model: 'm',
      }),
      ...extra,
    } as Session
  }

  it('renders Continue button when next_actions and task_id are present', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ task_id: 't1' })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('renders Continue button when next_actions and source_file are present', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ source_file: '/tmp/a.md' })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('hides Continue button when session has no originator', () => {
    wrap(<SessionDetailDrawer session={withNextActions({ task_id: null, source_file: null })} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('hides Continue button when next_actions array is empty', () => {
    const empty = {
      ...baseSession,
      task_id: 't1',
      next_actions: JSON.stringify({
        next_actions: [], open_questions: [], files_touched: [], extracted_at: 'x', model: 'm',
      }),
    } as Session
    wrap(<SessionDetailDrawer session={empty} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull()
  })

  it('POSTs to /api/sessions/{id}/continue and navigates on success', async () => {
    const session = withNextActions({ id: 'sX', task_id: 't1' })
    wrap(<SessionDetailDrawer session={session} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/sessions/sX/continue', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/sessions?selected=new-id')
    })
  })

  it('renders error message when API returns non-OK', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'a session for this task is already active' }), { status: 409 }),
    )
    const session = withNextActions({ id: 'sX', task_id: 't1' })
    wrap(<SessionDetailDrawer session={session} sessions={sessions} onClose={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent(/already active/i)
  })
})
