import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RightDrawer } from '@/components/tasks/RightDrawer'
import type { Task } from '@/lib/db/tasks'

const task: Task = {
  id: 'task-1', project_id: 'proj-1', title: 'Auth redesign', status: 'idea',
  idea_file: null, spec_file: null, plan_file: null, dev_summary: null,
  commit_refs: null, doc_refs: null, notes: null,
  priority: 'medium', labels: null, assignee_agent_id: null,
  provider_id: null,
  created_at: '2026-03-28T00:00:00Z', updated_at: '2026-03-30T00:00:00Z',
}

const sessions = [
  { id: 's1', phase: 'brainstorm', status: 'ended', created_at: '2026-03-30T00:00:00Z', ended_at: '2026-03-30T01:00:00Z' },
  { id: 's2', phase: 'spec', status: 'ended', created_at: '2026-03-31T00:00:00Z', ended_at: '2026-03-31T01:00:00Z' },
]

describe('RightDrawer — Sessions tab', () => {
  it('renders session phase labels without opening a WebSocket', () => {
    vi.stubGlobal('WebSocket', () => { throw new Error('WebSocket must not be opened in Sessions tab') })
    render(
      <RightDrawer task={task} section="sessions" sessions={sessions} onClose={vi.fn()} onNotesChange={vi.fn()} />
    )
    expect(screen.getByText('brainstorm')).toBeInTheDocument()
    expect(screen.getByText('spec')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows session count', () => {
    render(
      <RightDrawer task={task} section="sessions" sessions={sessions} onClose={vi.fn()} onNotesChange={vi.fn()} />
    )
    expect(screen.getByText(/2 sessions/i)).toBeInTheDocument()
  })
})
