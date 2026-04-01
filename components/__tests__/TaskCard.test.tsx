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

describe('TaskCard — priority chip', () => {
  it('renders "medium" priority chip', () => {
    render(<TaskCard task={{ ...baseTask, priority: 'medium', labels: null, assignee_agent_id: null }} onOpen={vi.fn()} />)
    expect(screen.getByText('medium')).toBeInTheDocument()
  })

  it('renders "urgent" chip in danger color (#c04040)', () => {
    render(<TaskCard task={{ ...baseTask, priority: 'urgent', labels: null, assignee_agent_id: null }} onOpen={vi.fn()} />)
    const chip = screen.getByText('urgent')
    expect(chip).toBeInTheDocument()
    // Color rendered as rgb by jsdom
    expect(chip.style.color).toBe('rgb(192, 64, 64)')
  })

  it('renders "high" chip in amber color (#c97e2a)', () => {
    render(<TaskCard task={{ ...baseTask, priority: 'high', labels: null, assignee_agent_id: null }} onOpen={vi.fn()} />)
    const chip = screen.getByText('high')
    expect(chip.style.color).toBe('rgb(201, 126, 42)')
  })

  it('renders "low" chip in muted color (#5a6370)', () => {
    render(<TaskCard task={{ ...baseTask, priority: 'low', labels: null, assignee_agent_id: null }} onOpen={vi.fn()} />)
    const chip = screen.getByText('low')
    expect(chip.style.color).toBe('rgb(90, 99, 112)')
  })
})
