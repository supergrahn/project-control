import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { DedupHint } from '../DedupHint'

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

describe('DedupHint', () => {
  it('renders nothing when the API returns []', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }))
    const { container } = wrap(<DedupHint projectId="proj-1" taskId="task-A" />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when top match score is below threshold', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ kind: 'task', ref: 'task-B-12345678', score: 0.6 }]), { status: 200 }),
    )
    const { container } = wrap(<DedupHint projectId="proj-1" taskId="task-A" />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container.firstChild).toBeNull()
  })

  it('renders inert hint with score percentage when score >= 0.85', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ kind: 'task', ref: 'task-B-12345678', score: 0.91 }]), { status: 200 }),
    )
    wrap(<DedupHint projectId="proj-1" taskId="task-A" />)
    const hint = await screen.findByText(/similar to another task/i)
    expect(hint.tagName).toBe('SPAN')  // not an anchor — internal tasks have no deep-link target
    expect(hint.textContent).toContain('91%')
    expect(hint.getAttribute('title')).toContain('task-B-12345678')
  })

  it('respects a lower custom threshold', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ kind: 'task', ref: 'task-B', score: 0.7 }]), { status: 200 }),
    )
    wrap(<DedupHint projectId="proj-1" taskId="task-A" threshold={0.6} />)
    expect(await screen.findByText(/similar to another task/i)).toBeInTheDocument()
  })

  it('POSTs kind=task with resultKinds=[task] and limit=1', async () => {
    fetchMock.mockResolvedValue(new Response('[]', { status: 200 }))
    wrap(<DedupHint projectId="proj-1" taskId="task-A" />)
    await new Promise((r) => setTimeout(r, 0))
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/api/projects/proj-1/embeddings/similar')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toEqual({ kind: 'task', ref: 'task-A', resultKinds: ['task'], limit: 1 })
  })
})
