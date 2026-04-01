import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TaskCard } from '@/components/tasks/TaskCard'
import type { Task } from '@/lib/db/tasks'

const baseTask: Task = {
  id: 'task-1',
  project_id: 'proj-1',
  title: 'Auth system redesign',
  status: 'idea',
  idea_file: null,
  spec_file: null,
  plan_file: null,
  dev_summary: null,
  commit_refs: null,
  doc_refs: null,
  notes: null,
  priority: 'medium',
  labels: null,
  assignee_agent_id: null,
  provider_id: null,
  created_at: '2026-03-28T00:00:00Z',
  updated_at: '2026-03-28T00:00:00Z',
}

describe('TaskCard', () => {
  it('renders the task title', () => {
    render(<TaskCard task={baseTask} onOpen={vi.fn()} />)
    expect(screen.getByText('Auth system redesign')).toBeInTheDocument()
  })

  it('shows No actions yet when no session exists', () => {
    render(<TaskCard task={baseTask} onOpen={vi.fn()} />)
    expect(screen.getByText('No actions yet')).toBeInTheDocument()
  })

  it('renders the phase label', () => {
    render(<TaskCard task={baseTask} onOpen={vi.fn()} />)
    expect(screen.getByText(/idea/i)).toBeInTheDocument()
  })

  it('shows Start Spec button for idea status', () => {
    render(<TaskCard task={baseTask} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /start spec/i })).toBeInTheDocument()
  })

  it('shows View History button for done status', () => {
    render(<TaskCard task={{ ...baseTask, status: 'done' }} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /view history/i })).toBeInTheDocument()
  })
})
