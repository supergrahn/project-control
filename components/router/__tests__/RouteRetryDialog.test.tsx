import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RouteRetryDialog } from '@/components/router/RouteRetryDialog'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

const decision = {
  id: 'd1',
  picked_provider: 'old',
  phase: 'develop' as const,
  complexity: 'normal' as const,
  score_breakdown: {
    suitability: 0.9,
    cost: 0.5,
    success_rate_blended: 0.85,
    n_observed: 0,
    total: 1.62,
    considered: [
      { providerId: 'old', providerName: 'Old', score: 1.62 },
      { providerId: 'new', providerName: 'NewOne', score: 1.40 },
      { providerId: 'thr', providerName: 'Third', score: 0.95 },
    ],
  },
}

describe('RouteRetryDialog', () => {
  it('renders error message and ranked alternatives excluding the failed route', () => {
    render(
      <RouteRetryDialog
        open
        sessionId="s1"
        errorMessage="rate limit"
        decision={decision}
        onClose={() => {}}
        onRetried={() => {}}
      />
    )
    expect(screen.getByText(/rate limit/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /NewOne/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Third/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Old/ })).toBeNull()
  })

  it('calls /restart-with-route on select and notifies caller', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const onRetried = vi.fn()
    render(
      <RouteRetryDialog
        open
        sessionId="s1"
        errorMessage="boom"
        decision={decision}
        onClose={() => {}}
        onRetried={onRetried}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /NewOne/ }))
    await waitFor(() => expect(onRetried).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sessions/s1/restart-with-route')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ providerId: 'new' })
  })

  it('shows the server error inline and does not call onRetried when restart fails', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'session not found' }), { status: 404 }))
    const onRetried = vi.fn()
    render(
      <RouteRetryDialog
        open
        sessionId="s1"
        errorMessage="boom"
        decision={decision}
        onClose={() => {}}
        onRetried={onRetried}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /NewOne/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert').textContent).toContain('session not found')
    expect(onRetried).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <RouteRetryDialog
        open
        sessionId="s1"
        errorMessage="boom"
        decision={decision}
        onClose={onClose}
        onRetried={() => {}}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
