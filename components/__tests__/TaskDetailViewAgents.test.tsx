import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'
import type { Task } from '@/lib/db/tasks'

vi.mock('@/hooks/useTasks', () => ({
  patchTask: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/components/tasks/LiveRunsSection', () => ({
  LiveRunsSection: () => <div data-testid="live-runs" />,
}))
vi.mock('@/components/tasks/PropertiesPanel', () => ({
  PropertiesPanel: () => <div data-testid="properties-panel" />,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

const task: Task = {
  id: 't-1', project_id: 'p-1', title: 'Auth', status: 'speccing',
  idea_file: null, spec_file: null, plan_file: null, dev_summary: null,
  commit_refs: null, doc_refs: null, notes: null,
  priority: 'medium', labels: null, assignee_agent_id: null, provider_id: null,
  created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

const agents = [
  { id: 'ag-1', project_id: 'p-1', name: 'CEO', status: 'idle', provider_id: 'prov-1' },
]

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionWindowProvider>{children}</SessionWindowProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/agents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(agents) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ sessionId: 'sess-new' }) })
  })
})

describe('Run with agent', () => {
  it('shows "Run with agent" button', () => {
    render(<TaskDetailView task={task} onOpenDrawer={() => {}} />, { wrapper })
    expect(screen.getByText(/run with agent/i)).toBeInTheDocument()
  })

  it('opens agent picker popover on click', async () => {
    render(<TaskDetailView task={task} onOpenDrawer={() => {}} />, { wrapper })
    fireEvent.click(screen.getByText(/run with agent/i))
    await waitFor(() => expect(screen.getByText('CEO')).toBeInTheDocument())
  })

  it('POSTs to /api/sessions with agentId when agent selected', async () => {
    render(<TaskDetailView task={task} onOpenDrawer={() => {}} />, { wrapper })
    fireEvent.click(screen.getByText(/run with agent/i))
    await waitFor(() => screen.getByText('CEO'))
    fireEvent.click(screen.getByText('CEO'))
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ag-1'),
      }))
    })
  })
})
