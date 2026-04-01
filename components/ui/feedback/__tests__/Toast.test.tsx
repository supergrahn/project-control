import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from '../Toast'

function TestComponent() {
  const toast = useToast()
  return (
    <button onClick={() => toast({ message: 'Saved!', variant: 'success' })}>
      Show Toast
    </button>
  )
}

describe('Toast', () => {
  it('shows toast message when triggered', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    await act(async () => {
      screen.getByText('Show Toast').click()
    })
    expect(screen.getByText('Saved!')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Saved!')).not.toBeInTheDocument()
    vi.useRealTimers()
  })
})
