import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionInput } from '@/components/tasks/SessionInput'

describe('SessionInput with History', () => {
  it('renders input field and send button', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)

    expect(screen.getByPlaceholderText(/Send input/)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('submits input on Enter key', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'test command' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('test command')
    expect(input.value).toBe('')
  })

  it('allows Shift+Enter for newlines', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'line1' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
  })

  it('cycles backward through history with ArrowUp', () => {
    const onSend = vi.fn()
    const { rerender } = render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement

    // Add two commands to history
    fireEvent.change(input, { target: { value: 'cmd1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    rerender(<SessionInput onSend={onSend} disabled={false} />)
    fireEvent.change(input, { target: { value: 'cmd2' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    rerender(<SessionInput onSend={onSend} disabled={false} />)

    // Now navigate history
    const newInput = screen.getByPlaceholderText(/Send input/) as HTMLInputElement
    fireEvent.keyDown(newInput, { key: 'ArrowUp' })

    expect(newInput.value).toBe('cmd2')

    fireEvent.keyDown(newInput, { key: 'ArrowUp' })
    expect(newInput.value).toBe('cmd1')
  })

  it('cycles forward through history with ArrowDown', () => {
    const onSend = vi.fn()
    const { rerender } = render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement

    // Add two commands to history
    fireEvent.change(input, { target: { value: 'cmd1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    rerender(<SessionInput onSend={onSend} disabled={false} />)
    fireEvent.change(input, { target: { value: 'cmd2' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    rerender(<SessionInput onSend={onSend} disabled={false} />)

    // Navigate backward then forward
    const newInput = screen.getByPlaceholderText(/Send input/) as HTMLInputElement
    fireEvent.keyDown(newInput, { key: 'ArrowUp' })
    fireEvent.keyDown(newInput, { key: 'ArrowUp' })
    fireEvent.keyDown(newInput, { key: 'ArrowDown' })

    expect(newInput.value).toBe('cmd2')

    fireEvent.keyDown(newInput, { key: 'ArrowDown' })
    expect(newInput.value).toBe('')
  })

  it('limits history to 50 entries', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement

    // Add 60 commands within the same component instance
    for (let i = 0; i < 60; i++) {
      fireEvent.change(input, { target: { value: `cmd${i}` } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // Input should be cleared after submission
      expect(input.value).toBe('')
    }

    // Try to navigate up — should only be able to go back 50 times max
    let reachedEnd = false
    for (let i = 0; i < 51; i++) {
      const beforeValue = input.value
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      // If value doesn't change, we've reached the end of history
      if (input.value === beforeValue) {
        reachedEnd = true
        break
      }
    }

    // Should have reached the end of history (max 50 entries)
    expect(reachedEnd).toBe(true)
  })

  it('disables input when disabled prop is true', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={true} />)

    const input = screen.getByPlaceholderText(/No active session/) as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not submit empty input', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)

    const input = screen.getByPlaceholderText(/Send input/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
  })
})
