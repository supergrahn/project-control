import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'
import * as useTasks from '@/hooks/useTasks'

const mockTask = {
  id: 'new-task', project_id: 'proj-1', title: 'My task', status: 'idea' as const,
  priority: 'medium', labels: null, assignee_agent_id: null,
  idea_file: null, spec_file: null, plan_file: null, dev_summary: null,
  commit_refs: null, doc_refs: null, notes: null,
  provider_id: null,
  created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
}

vi.mock('@/hooks/useTasks', () => ({
  createTask: vi.fn(),
}))

global.fetch = vi.fn()

const mockOnCreated = vi.fn()
const mockOnClose = vi.fn()
const mockOnNavigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useTasks.createTask).mockResolvedValue(mockTask)
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => [{ id: 'p1', name: 'Claude', active: true }] } as Response)
})

describe('CreateTaskModal', () => {
  it('autofocuses the title input on open', () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/task title/i))
  })

  it('Escape key closes the modal', () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('Save button calls createTask with fields and closes modal', async () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: 'My task' } })
    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'Some notes' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => {
      expect(useTasks.createTask).toHaveBeenCalledWith(
        'proj-1', 'My task', 'Some notes',
        expect.objectContaining({ priority: 'medium' })
      )
      expect(mockOnCreated).toHaveBeenCalled()
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  it('Cmd+Enter submits Save', async () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: 'My task' } })
    fireEvent.keyDown(document, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(useTasks.createTask).toHaveBeenCalled())
  })

  it('Enter in title moves focus to description', () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    fireEvent.keyDown(screen.getByPlaceholderText(/task title/i), { key: 'Enter' })
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/description/i))
  })

  it('Start now creates task, POSTs session, and navigates', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'p1' }] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sessionId: 's1' }) } as Response)
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    fireEvent.change(screen.getByPlaceholderText(/task title/i), { target: { value: 'My task' } })
    fireEvent.click(screen.getByRole('button', { name: /start now/i }))
    await waitFor(() => {
      expect(useTasks.createTask).toHaveBeenCalled()
      expect(fetch).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({ method: 'POST' }))
      expect(mockOnNavigate).toHaveBeenCalledWith('new-task')
    })
  })

  it('disables Start now when no providers configured', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start now/i })).toBeDisabled()
    })
  })

  it('shows tooltip on disabled Start now button', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    await waitFor(() => screen.getByRole('button', { name: /start now/i }))
    expect(screen.getByTitle(/no providers configured/i)).toBeInTheDocument()
  })

  it('adds label on Enter and shows tag', () => {
    render(<CreateTaskModal projectId="proj-1" onCreated={mockOnCreated} onClose={mockOnClose} onNavigate={mockOnNavigate} />)
    const labelInput = screen.getByPlaceholderText(/add label/i)
    fireEvent.change(labelInput, { target: { value: 'backend' } })
    fireEvent.keyDown(labelInput, { key: 'Enter' })
    expect(screen.getByText('backend')).toBeInTheDocument()
  })
})
