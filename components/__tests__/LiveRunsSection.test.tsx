import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { LiveRunsSection } from '@/components/tasks/LiveRunsSection'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

global.fetch = vi.fn()

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: (() => void) | null = null
  close = vi.fn()
  constructor(public url: string) { MockWebSocket.instances.push(this) }
  emit(data: string) { this.onmessage?.({ data } as MessageEvent) }
}
vi.stubGlobal('WebSocket', MockWebSocket)

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionWindowProvider>{children}</SessionWindowProvider>
}

const mockSession = {
  id: 'sess-1', project_id: 'proj-1', task_id: 'task-1',
  label: 'Auth redesign', phase: 'brainstorm', status: 'active',
  created_at: '2026-04-01T10:00:00Z', ended_at: null,
}

describe('LiveRunsSection — inactive state', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response)
  })

  it('shows "No active run" when no active session', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/no active run/i)).toBeInTheDocument())
  })

  it('does not open a WebSocket when no active session', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => screen.getByText(/no active run/i))
    expect(MockWebSocket.instances).toHaveLength(0)
  })
})

describe('LiveRunsSection — active state', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [mockSession] } as Response)
  })

  it('shows session label and phase badge when active', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByText(/auth redesign/i)).toBeInTheDocument())
    expect(screen.getByText(/brainstorm/i)).toBeInTheDocument()
  })

  it('opens a WebSocket to the active session', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].url).toContain('/api/sessions/sess-1/ws')
  })

  it('appends terminal output lines from WebSocket messages', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit('Bash · npm test') })
    expect(screen.getByText(/npm test/i)).toBeInTheDocument()
  })

  it('parses TodoWrite messages and calls onTodos', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const todos = [{ id: '1', content: 'Write tests', status: 'pending' }]
    act(() => { MockWebSocket.instances[0].emit(`TodoWrite · ${JSON.stringify(todos)}`) })
    expect(onTodos).toHaveBeenCalledWith(todos)
  })

  it('resets todos to [] when session ends via status message', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit(JSON.stringify({ type: 'status', state: 'ended' })) })
    expect(onTodos).toHaveBeenLastCalledWith([])
  })

  it('renders Stop and Open terminal buttons', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /open terminal/i })).toBeInTheDocument()
  })

  it('calls DELETE /api/sessions/{id} when Stop clicked', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [mockSession] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response)
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => screen.getByRole('button', { name: /stop/i }))
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/sessions/sess-1', { method: 'DELETE' })
    })
  })
})
