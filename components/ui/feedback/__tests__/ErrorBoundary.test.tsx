import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary'

function BrokenComponent(): JSX.Element {
  throw new Error('Boom')
}

describe('ErrorBoundary', () => {
  const originalError = console.error
  beforeEach(() => { console.error = vi.fn() })
  afterEach(() => { console.error = originalError })

  it('renders children when no error', () => {
    render(<ErrorBoundary><div>OK</div></ErrorBoundary>)
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('renders fallback when child throws', () => {
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows error message', () => {
    render(<ErrorBoundary><BrokenComponent /></ErrorBoundary>)
    expect(screen.getByText('Boom')).toBeInTheDocument()
  })
})
