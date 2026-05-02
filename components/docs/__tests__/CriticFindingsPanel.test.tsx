import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { CriticFindingsPanel } from '../CriticFindingsPanel'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function wrap(ui: React.ReactElement) {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>)
}

const findingsResponse = {
  findings: {
    issues: [
      { severity: 'critical', category: 'placeholder', message: 'TODO: define the API shape', line_hint: 47 },
      { severity: 'important', category: 'ambiguity', message: '"the helper handles both" — which helper?' },
      { severity: 'minor', category: 'style', message: 'inconsistent capitalization' },
    ],
    votes: 3,
    model: 'qwen-3.6:9b',
    run_at: '2026-05-02T10:00:00.000Z',
  },
  content_hash: 'abc123',
}

describe('CriticFindingsPanel', () => {
  it('renders nothing when the endpoint returns null', async () => {
    fetchMock.mockResolvedValue(new Response('null', { status: 200 }))
    const { container } = wrap(
      <CriticFindingsPanel projectId="proj-1" docRef="docs/superpowers/specs/foo.md" currentHash="abc123" />,
    )
    // SWR resolves async — but a null payload short-circuits to null render.
    await new Promise((r) => setTimeout(r, 0))
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when issues array is empty', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ findings: { issues: [], votes: 3, model: 'm', run_at: 'now' }, content_hash: 'h' }), { status: 200 }),
    )
    const { container } = wrap(
      <CriticFindingsPanel projectId="proj-1" docRef="docs/superpowers/specs/foo.md" currentHash="h" />,
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(container.firstChild).toBeNull()
  })

  it('renders severity counts and each issue when findings exist', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(findingsResponse), { status: 200 }))
    wrap(
      <CriticFindingsPanel projectId="proj-1" docRef="docs/superpowers/specs/foo.md" currentHash="abc123" />,
    )
    expect(await screen.findByText(/1 critical/)).toBeInTheDocument()
    expect(screen.getByText(/1 important/)).toBeInTheDocument()
    expect(screen.getByText(/1 minor/)).toBeInTheDocument()
    expect(screen.getByText(/TODO: define the API shape/)).toBeInTheDocument()
    expect(screen.getByText(/which helper/)).toBeInTheDocument()
    expect(screen.getByText(/\(line 47\)/)).toBeInTheDocument()
  })

  it('shows stale badge when the stored content_hash differs from currentHash', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(findingsResponse), { status: 200 }))
    wrap(
      <CriticFindingsPanel projectId="proj-1" docRef="docs/superpowers/specs/foo.md" currentHash="DIFFERENT" />,
    )
    expect(await screen.findByText(/stale.*re-running/i)).toBeInTheDocument()
  })

  it('hides the stale badge when hashes match', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(findingsResponse), { status: 200 }))
    wrap(
      <CriticFindingsPanel projectId="proj-1" docRef="docs/superpowers/specs/foo.md" currentHash="abc123" />,
    )
    // Wait for findings to render.
    expect(await screen.findByText(/1 critical/)).toBeInTheDocument()
    expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
  })

  it('encodes ref in the API URL', async () => {
    fetchMock.mockResolvedValue(new Response('null', { status: 200 }))
    wrap(
      <CriticFindingsPanel
        projectId="proj-1"
        docRef="docs/superpowers/specs/has space.md"
        currentHash="h"
      />,
    )
    await new Promise((r) => setTimeout(r, 0))
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('ref=docs%2Fsuperpowers%2Fspecs%2Fhas%20space.md')
  })
})
