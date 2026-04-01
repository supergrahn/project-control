import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import { SessionWindowProvider } from '@/hooks/useSessionWindows'
import type { Task } from '@/lib/db/tasks'

vi.mock('@/hooks/useTasks', () => ({
  patchTask: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/components/tasks/LiveRunsSection', () => ({
  LiveRunsSection: ({ onTodos }: { onTodos: (t: any[]) => void }) => (
    <div data-testid="live-runs">
      <button onClick={() => onTodos([
        { id: '1', content: 'Write tests', status: 'in_progress' },
        { id: '2', content: 'Deploy', status: 'pending' },
      ])}>inject todos</button>
    </div>
  ),
}))
vi.mock('@/components/tasks/PropertiesPanel', () => ({
  PropertiesPanel: () => <div data-testid="properties-panel" />,
}))

global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] } as Response)

const task: Task = {
  id: 'task-1', project_id: 'proj-1', title: 'Auth redesign', status: 'planning',
  idea_file: '/tmp/idea.md', spec_file: '/tmp/spec.md', plan_file: null, dev_summary: null,
  commit_refs: null, doc_refs: null, notes: 'Some notes',
  priority: 'medium', labels: null, assignee_agent_id: null,
  provider_id: null,
  created_at: '2026-03-28T00:00:00Z', updated_at: '2026-03-30T00:00:00Z',
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <SessionWindowProvider>{children}</SessionWindowProvider>
}

describe('TaskDetailView', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders task title in an editable input', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    expect(screen.getByDisplayValue('Auth redesign')).toBeInTheDocument()
  })

  it('renders PropertiesPanel', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('properties-panel')).toBeInTheDocument()
  })

  it('renders LiveRunsSection', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('live-runs')).toBeInTheDocument()
  })

  it('saves title on blur via patchTask when changed', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    const titleInput = screen.getByDisplayValue('Auth redesign')
    fireEvent.change(titleInput, { target: { value: 'New title' } })
    fireEvent.blur(titleInput)
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { title: 'New title' }))
  })

  it('does not call patchTask on blur when title unchanged', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    fireEvent.blur(screen.getByDisplayValue('Auth redesign'))
    await waitFor(() => expect(patchTask).not.toHaveBeenCalled())
  })

  it('saves description (notes) on blur via patchTask when changed', async () => {
    const { patchTask } = await import('@/hooks/useTasks')
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    const textarea = screen.getByDisplayValue('Some notes')
    fireEvent.change(textarea, { target: { value: 'Updated notes' } })
    fireEvent.blur(textarea)
    await waitFor(() => expect(patchTask).toHaveBeenCalledWith('task-1', { notes: 'Updated notes' }))
  })

  it('calls onOpenDrawer with correct section on button click', () => {
    const onOpenDrawer = vi.fn()
    render(<TaskDetailView task={task} onOpenDrawer={onOpenDrawer} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: /artifacts/i }))
    expect(onOpenDrawer).toHaveBeenCalledWith('artifacts')
  })

  it('shows Agent Tasks section when todos are injected', async () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByText('inject todos'))
    await waitFor(() => expect(screen.getByText(/agent tasks/i)).toBeInTheDocument())
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('Deploy')).toBeInTheDocument()
  })

  it('hides Agent Tasks section when todos are empty', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    expect(screen.queryByText(/agent tasks/i)).not.toBeInTheDocument()
  })

  it('applies bold style to in_progress todo items', async () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByText('inject todos'))
    await waitFor(() => screen.getByText('Write tests'))
    const inProgressItem = screen.getByText('Write tests')
    expect(inProgressItem.style.fontWeight).toBe('700')
  })

  it('renders Comments placeholder', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />, { wrapper })
    expect(screen.getByText(/comments/i)).toBeInTheDocument()
  })
})
