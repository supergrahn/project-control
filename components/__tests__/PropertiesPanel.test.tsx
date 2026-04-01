import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PropertiesPanel } from '@/components/tasks/PropertiesPanel'
import type { Task } from '@/lib/db/tasks'

vi.mock('@/hooks/useTasks', () => ({
  patchTask: vi.fn().mockResolvedValue({}),
}))

global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => [] } as Response)

const baseTask: Task = {
  id: 'task-1', project_id: 'proj-1', title: 'Auth redesign', status: 'idea',
  idea_file: null, spec_file: null, plan_file: null, dev_summary: null,
  commit_refs: null, doc_refs: null, notes: null,
  priority: 'medium', labels: null, assignee_agent_id: null,
  provider_id: null,
  created_at: '2026-03-28T00:00:00Z', updated_at: '2026-03-30T00:00:00Z',
}

describe('PropertiesPanel', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders all field labels', () => {
    render(<PropertiesPanel task={baseTask} />)
    expect(screen.getByText(/status/i)).toBeInTheDocument()
    expect(screen.getByText(/priority/i)).toBeInTheDocument()
    expect(screen.getByText(/labels/i)).toBeInTheDocument()
    expect(screen.getByText(/assignee/i)).toBeInTheDocument()
    expect(screen.getByText(/created/i)).toBeInTheDocument()
    expect(screen.getByText(/updated/i)).toBeInTheDocument()
  })

  it('shows current status in dropdown', () => {
    render(<PropertiesPanel task={baseTask} />)
    expect(screen.getByDisplayValue(/idea/i)).toBeInTheDocument()
  })

  it('calls patchTask with new status on dropdown change', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<PropertiesPanel task={baseTask} />)
    fireEvent.change(screen.getByDisplayValue(/idea/i), { target: { value: 'speccing' } })
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { status: 'speccing' }))
  })

  it('highlights the current priority chip', () => {
    render(<PropertiesPanel task={{ ...baseTask, priority: 'high' }} />)
    expect(screen.getByText(/high/i)).toBeInTheDocument()
  })

  it('calls patchTask with new priority on chip click', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<PropertiesPanel task={baseTask} />)
    fireEvent.click(screen.getByText(/urgent/i))
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { priority: 'urgent' }))
  })

  it('adds a label on Enter and calls patchTask', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<PropertiesPanel task={baseTask} />)
    const input = screen.getByPlaceholderText(/add label/i)
    fireEvent.change(input, { target: { value: 'backend' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { labels: '["backend"]' }))
  })

  it('removes a label on × click and calls patchTask', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<PropertiesPanel task={{ ...baseTask, labels: '["backend","auth"]' }} />)
    const removeButtons = screen.getAllByRole('button', { name: '×' })
    fireEvent.click(removeButtons[0])
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { labels: '["auth"]' }))
  })

  it('shows "No agents configured yet" when agents fetch returns error', async () => {
    render(<PropertiesPanel task={baseTask} />)
    await waitFor(() => expect(screen.getByText(/no agents configured yet/i)).toBeInTheDocument())
  })

  it('renders formatted created_at date', () => {
    render(<PropertiesPanel task={baseTask} />)
    expect(screen.getByText(/mar 28/i)).toBeInTheDocument()
  })
})
