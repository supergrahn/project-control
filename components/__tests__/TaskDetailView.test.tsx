import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskDetailView } from '@/components/tasks/TaskDetailView'
import type { Task } from '@/lib/db/tasks'

const task: Task = {
  id: 'task-1',
  project_id: 'proj-1',
  title: 'Auth redesign',
  status: 'planning',
  idea_file: '/tmp/idea.md',
  spec_file: '/tmp/spec.md',
  plan_file: null,
  dev_summary: null,
  commit_refs: null,
  doc_refs: null,
  notes: null,
  created_at: '2026-03-28T00:00:00Z',
  updated_at: '2026-03-30T00:00:00Z',
}

describe('TaskDetailView', () => {
  it('renders task title', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />)
    expect(screen.getByText('Auth redesign')).toBeInTheDocument()
  })

  it('shows completed phases as collapsed rows', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />)
    expect(screen.getByText(/idea/i)).toBeInTheDocument()
    expect(screen.getByText(/spec/i)).toBeInTheDocument()
  })

  it('shows pending phases as dashed rows', () => {
    render(<TaskDetailView task={task} onOpenDrawer={vi.fn()} />)
    expect(screen.getByText(/developing/i)).toBeInTheDocument()
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })
})
