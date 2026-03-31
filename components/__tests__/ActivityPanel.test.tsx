import { render, screen } from '@testing-library/react'
import { ActivityPanel } from '../dashboard/ActivityPanel'
import type { Task } from '@/lib/db/tasks'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'

const makePlanTask = (overrides: Partial<Task> = {}): Task => ({
  id: 't1', project_id: 'p1', title: 'Redesign Sidebar', status: 'planning',
  idea_file: null, spec_file: null, plan_file: '/path/plan.md', dev_summary: null,
  commit_refs: null, doc_refs: null, notes: null, created_at: '2026-03-31T08:00:00Z', updated_at: '2026-03-31T08:00:00Z',
  ...overrides,
})

const feedEntries: FeedEntry[] = [
  { id: 'f1', sessionId: 's1', label: 'Session A', phase: 'spec', text: 'Write · Sidebar.tsx', timestamp: '2026-03-31T08:01:00Z' },
  { id: 'f2', sessionId: 's2', label: 'Session B', phase: 'plan', text: 'Read · plan.md', timestamp: '2026-03-31T08:02:00Z' },
]

describe('ActivityPanel', () => {
  it('renders the Actions Required section', () => {
    render(<ActivityPanel tasks={[makePlanTask()]} feed={[]} />)
    expect(screen.getByText('Actions Required')).toBeInTheDocument()
  })

  it('shows a plan-ready action for a planning task with plan_file', () => {
    render(<ActivityPanel tasks={[makePlanTask()]} feed={[]} />)
    expect(screen.getByText('Redesign Sidebar')).toBeInTheDocument()
    expect(screen.getByText('Plan ready')).toBeInTheDocument()
  })

  it('renders Live Feed section', () => {
    render(<ActivityPanel tasks={[]} feed={feedEntries} />)
    expect(screen.getByText('Live Feed')).toBeInTheDocument()
  })

  it('renders feed entries newest first', () => {
    render(<ActivityPanel tasks={[]} feed={feedEntries} />)
    const items = screen.getAllByRole('listitem')
    // f2 is newer, should appear first
    expect(items[0].textContent).toContain('Read · plan.md')
    expect(items[1].textContent).toContain('Write · Sidebar.tsx')
  })

  it('shows empty state when no actions required', () => {
    render(<ActivityPanel tasks={[]} feed={[]} />)
    expect(screen.getByText('No actions required')).toBeInTheDocument()
  })
})
