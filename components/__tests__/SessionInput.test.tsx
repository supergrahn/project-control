import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionInput } from '@/components/tasks/SessionInput'

describe('SessionInput', () => {
  it('renders input and send button', () => {
    render(<SessionInput onSend={vi.fn()} disabled={false} />)
    expect(screen.getByPlaceholderText(/send input/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('calls onSend with input value and clears on submit', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).toHaveBeenCalledWith('hello world')
    expect(input).toHaveValue('')
  })

  it('submits on Enter key', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('test')
  })

  it('does not submit on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    const input = screen.getByPlaceholderText(/send input/i)
    fireEvent.change(input, { target: { value: 'test' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not submit empty input', () => {
    const onSend = vi.fn()
    render(<SessionInput onSend={onSend} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(onSend).not.toHaveBeenCalled()
  })

  it('disables input and button when disabled prop is true', () => {
    render(<SessionInput onSend={vi.fn()} disabled={true} />)
    expect(screen.getByPlaceholderText(/no active session/i)).toBeDisabled()
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })
})
