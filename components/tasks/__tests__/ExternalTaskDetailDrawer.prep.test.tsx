import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ExternalTaskDetailDrawer } from '@/components/tasks/ExternalTaskDetailDrawer'
import type { ExternalTask } from '@/lib/types/externalTask'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }))
})

const baseTask = (overrides: Partial<ExternalTask> = {}): ExternalTask => ({
  id: 'JIRA-1',
  source: 'jira',
  url: 'http://x/JIRA-1',
  title: 'Login breaks',
  description: 'Customer reports SSO failure',
  status: 'todo',
  priority: 'high',
  project: 'Web',
  labels: [],
  assignees: [],
  dueDate: null,
  createdAt: null,
  updatedAt: null,
  meta: {},
  ...overrides,
})

describe('ExternalTaskDetailDrawer prep panel', () => {
  it('shows "Not yet prepped" + Prepare-now button when prep_status is null', () => {
    const task = baseTask({ prep_status: null, prep_notes: null })
    render(<ExternalTaskDetailDrawer task={task} tasks={[task]} onClose={() => {}} onNavigate={() => {}} />)
    expect(screen.getByText(/not yet prepped/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /prepare now/i })).toBeInTheDocument()
  })

  it('shows the summary, files, and open questions when ready', () => {
    const notes = {
      summary: 'User cannot log in via SSO.',
      intent: 'Likely a callback URL regression after the deploy.',
      files: [{ path: 'lib/auth/sso.ts', why: 'callback handler' }],
      open_questions: ['Which SSO provider — Okta or Azure?'],
      generated_at: '2026-05-01T12:00:00.000Z',
      model: 'qwen-3.6:9b',
    }
    const task = baseTask({ prep_status: 'ready', prep_notes: JSON.stringify(notes), prepped_at: '2026-05-01T12:00:00.000Z' })
    render(<ExternalTaskDetailDrawer task={task} tasks={[task]} onClose={() => {}} onNavigate={() => {}} />)
    expect(screen.getByText(/user cannot log in via SSO/i)).toBeInTheDocument()
    expect(screen.getByText(/lib\/auth\/sso\.ts/)).toBeInTheDocument()
    expect(screen.getByText(/Okta or Azure/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /re-prep/i })).toBeInTheDocument()
  })

  it('Prepare-now button calls POST /api/tasks/:id/prepare', async () => {
    const task = baseTask({ prep_status: null, prep_notes: null })
    render(<ExternalTaskDetailDrawer task={task} tasks={[task]} onClose={() => {}} onNavigate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /prepare now/i }))
    expect(fetchMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0]
    expect(typeof url).toBe('string')
    expect((init as RequestInit).method).toBe('POST')
  })
})
