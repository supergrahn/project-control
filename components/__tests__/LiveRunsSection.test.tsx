import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react'
import { LiveRunsSection } from '@/components/tasks/LiveRunsSection'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'

global.fetch = vi.fn()

class MockWebSocket {
  static instances: MockWebSocket[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: (() => void) | null = null
  readyState = 1 // OPEN
  close = vi.fn()
  send = vi.fn()
  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    // Trigger onopen asynchronously
    setTimeout(() => this.onopen?.(), 0)
  }
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

  it('opens a WebSocket and sends attach message', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    expect(MockWebSocket.instances[0].url).toContain('/ws')
    await waitFor(() => {
      expect(MockWebSocket.instances[0].send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'attach', sessionId: 'sess-1' })
      )
    })
  })

  it('appends terminal output from JSON output messages', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: 'Bash · npm test' })) })
    expect(screen.getByText(/npm test/i)).toBeInTheDocument()
  })

  it('parses TodoWrite messages from output events', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const todos = [{ id: '1', content: 'Write tests', status: 'pending' }]
    act(() => {
      MockWebSocket.instances[0].emit(JSON.stringify({ type: 'output', data: `TodoWrite · ${JSON.stringify(todos)}` }))
    })
    expect(onTodos).toHaveBeenCalledWith(todos)
  })

  it('resets todos to [] when session ends via status message', async () => {
    const onTodos = vi.fn()
    render(<LiveRunsSection taskId="task-1" onTodos={onTodos} />, { wrapper })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => { MockWebSocket.instances[0].emit(JSON.stringify({ type: 'status', state: 'ended' })) })
    expect(onTodos).toHaveBeenLastCalledWith([])
  })

  it('renders Stop, Open Terminal, and input bar', async () => {
    render(<LiveRunsSection taskId="task-1" onTodos={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /open terminal/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/send input/i)).toBeInTheDocument()
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
