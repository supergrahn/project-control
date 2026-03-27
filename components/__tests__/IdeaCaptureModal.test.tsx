import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IdeaCaptureModal } from '../IdeaCaptureModal'

describe('IdeaCaptureModal', () => {
  it('calls onConfirm with name and pitch', () => {
    const onConfirm = vi.fn()
    render(<IdeaCaptureModal onCancel={vi.fn()} onConfirm={onConfirm} />)
    fireEvent.change(screen.getByLabelText('Idea title'), { target: { value: 'My Cool Idea' } })
    fireEvent.change(screen.getByLabelText('Pitch (optional)'), { target: { value: 'It solves X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Ideating' }))
    expect(onConfirm).toHaveBeenCalledWith({ name: 'My Cool Idea', pitch: 'It solves X' })
  })

  it('disables submit when title is empty', () => {
    render(<IdeaCaptureModal onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Start Ideating' })).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<IdeaCaptureModal onCancel={onCancel} onConfirm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
