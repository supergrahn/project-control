import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { DocSessionsPanel } from '../DocSessionsPanel'
import type { Session } from '@/hooks/useSessions'

const pushSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function wrap(ui: React.ReactElement) {
  // Disable SWR cache between tests so prior fixtures don't leak across `it` blocks.
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>)
}

const baseSession: Session = {
  id: 'sess-existing-1', project_id: 'proj-1', label: 'Existing session',
  phase: 'developing', source_file: '/abs/specs/foo.md', status: 'ended',
  created_at: '2026-05-01T10:00:00.000Z', ended_at: '2026-05-01T11:00:00.000Z',
  summary: 'wrap-up text',
}

describe('DocSessionsPanel', () => {
  it('renders the empty state when no sessions and no similar matches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/docs/sessions?')) return new Response('[]', { status: 200 })
      if (url.includes('/embeddings/similar')) return new Response('[]', { status: 200 })
      return new Response('[]', { status: 200 })
    })
    wrap(<DocSessionsPanel projectId="proj-1" relativePath="specs/foo.md" />)
    expect(await screen.findByText(/no sessions yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/related sessions from elsewhere/i)).not.toBeInTheDocument()
  })

  it('renders direct sessions plus a "Related sessions from elsewhere" list when similar matches arrive', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/docs/sessions?')) {
        return new Response(JSON.stringify([baseSession]), { status: 200 })
      }
      if (url.includes('/embeddings/similar')) {
        return new Response(JSON.stringify([
          { kind: 'session_summary', ref: 'sess-aaaaaaaa-bbbb-cccc', score: 0.91 },
          { kind: 'session_summary', ref: 'sess-1234567890', score: 0.83 },
        ]), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    })
    wrap(<DocSessionsPanel projectId="proj-1" relativePath="specs/foo.md" />)

    expect(await screen.findByText('Existing session')).toBeInTheDocument()
    expect(await screen.findByText(/related sessions from elsewhere/i)).toBeInTheDocument()
    // First match — first 8 chars rendered, percentage shown
    expect(screen.getByText(/session sess-aaa/i)).toBeInTheDocument()
    expect(screen.getByText(/91% match/)).toBeInTheDocument()
    expect(screen.getByText(/83% match/)).toBeInTheDocument()
  })

  it('calls the similar endpoint with the doc kind and resultKinds=session_summary', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }))
    wrap(<DocSessionsPanel projectId="proj-1" relativePath="specs/foo.md" />)
    await waitFor(() => {
      const similarCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/embeddings/similar'))
      expect(similarCall).toBeTruthy()
      const [, init] = similarCall!
      expect((init as RequestInit).method).toBe('POST')
      const body = JSON.parse((init as RequestInit).body as string)
      expect(body).toEqual({
        kind: 'doc',
        ref: 'specs/foo.md',
        resultKinds: ['session_summary'],
        limit: 5,
      })
    })
  })

  it('hides the similar list when the endpoint returns []', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/docs/sessions?')) {
        return new Response(JSON.stringify([baseSession]), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    })
    wrap(<DocSessionsPanel projectId="proj-1" relativePath="specs/foo.md" />)
    expect(await screen.findByText('Existing session')).toBeInTheDocument()
    expect(screen.queryByText(/related sessions from elsewhere/i)).not.toBeInTheDocument()
  })
})
