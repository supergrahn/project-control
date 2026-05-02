import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionGridCard } from '../SessionGridCard'
import type { Session } from '@/hooks/useSessions'

const killMutate = vi.fn()
vi.mock('@/hooks/useSessions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSessions')>()
  return { ...actual, useKillSession: () => ({ mutate: killMutate }) }
})

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'proj-1', name: 'My Project' }] }),
}))

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const baseSession: Session = {
  id: 'sess-1',
  project_id: 'proj-1',
  label: 'Build feature',
  phase: 'developing',
  source_file: null,
  status: 'active',
  created_at: '2026-05-02T10:00:00.000Z',
  ended_at: null,
}

describe('SessionGridCard', () => {
  it('renders project name, label, and phase', () => {
    wrap(<SessionGridCard session={baseSession} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
    expect(screen.getByText('Build feature')).toBeInTheDocument()
    expect(screen.getByText(/developing/i)).toBeInTheDocument()
  })

  it('falls back to project_id when project not found in useProjects()', () => {
    // The top-level useProjects mock returns only proj-1; rendering with a different
    // project_id exercises the `?? session.project_id` fallback.
    wrap(<SessionGridCard session={{ ...baseSession, project_id: 'unknown-proj' }} />)
    expect(screen.getByText('unknown-proj')).toBeInTheDocument()
  })

  it('shows Stop button only for active sessions', () => {
    wrap(<SessionGridCard session={baseSession} />)
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
  })

  it('hides Stop button for ended sessions', () => {
    wrap(<SessionGridCard session={{ ...baseSession, ended_at: '2026-05-02T11:00:00.000Z' }} />)
    expect(screen.queryByRole('button', { name: /stop/i })).not.toBeInTheDocument()
  })

  it('Stop button calls kill mutation and stops propagation', () => {
    const parentClick = vi.fn()
    wrap(
      <div onClick={parentClick}>
        <SessionGridCard session={baseSession} />
      </div>
    )
    fireEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(killMutate).toHaveBeenCalledWith('sess-1')
    expect(parentClick).not.toHaveBeenCalled()
  })
})
