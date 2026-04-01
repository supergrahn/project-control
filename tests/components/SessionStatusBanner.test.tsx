import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'

describe('SessionStatusBanner', () => {
  it('renders active state', () => {
    render(<SessionStatusBanner state="active" />)
    expect(screen.getByText('Running session')).toBeInTheDocument()
  })

  it('renders rate_limited state with provider', () => {
    render(<SessionStatusBanner state="rate_limited" provider="claude" retryAfter={45} />)
    expect(screen.getByText(/Rate limited — claude/)).toBeInTheDocument()
  })

  it('renders ended state with completed reason', () => {
    render(<SessionStatusBanner state="ended" reason="completed" />)
    expect(screen.getByText('Session completed successfully')).toBeInTheDocument()
  })

  it('renders ended state with killed reason', () => {
    render(<SessionStatusBanner state="ended" reason="killed" />)
    expect(screen.getByText('Session stopped by user')).toBeInTheDocument()
  })

  it('renders ended state with error reason and message', () => {
    render(
      <SessionStatusBanner state="ended" reason="error" message="spawn ENOENT: command not found" />
    )
    expect(screen.getByText(/Error: spawn ENOENT/)).toBeInTheDocument()
  })

  it('renders unresponsive state', () => {
    render(<SessionStatusBanner state="unresponsive" />)
    expect(screen.getByText(/No output for 5 minutes/)).toBeInTheDocument()
  })

  it('renders paused state', () => {
    render(<SessionStatusBanner state="paused" />)
    expect(screen.getByText('Paused by user')).toBeInTheDocument()
  })

  it('displays retry timer countdown', async () => {
    const { rerender } = render(
      <SessionStatusBanner state="rate_limited" provider="test" retryAfter={3} />
    )
    expect(screen.getByText(/Resuming in 3s/)).toBeInTheDocument()
  })
})
