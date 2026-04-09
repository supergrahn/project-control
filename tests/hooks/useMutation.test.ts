import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMutation } from '@/hooks/useMutation'

// Mock the toast context
const mockToast = vi.fn()
vi.mock('@/components/ui/feedback/Toast', () => ({
  useToast: () => mockToast,
}))

describe('useMutation', () => {
  beforeEach(() => { mockToast.mockClear() })

  it('returns result on success', async () => {
    const { result } = renderHook(() => useMutation())
    const value = await act(() => result.current(() => Promise.resolve(42)))
    expect(value).toBe(42)
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('shows error toast and returns undefined on failure', async () => {
    const { result } = renderHook(() => useMutation())
    const value = await act(() =>
      result.current(() => Promise.reject(new Error('oops')), 'Update failed')
    )
    expect(value).toBeUndefined()
    expect(mockToast).toHaveBeenCalledWith({
      message: 'Update failed',
      variant: 'error',
    })
  })

  it('uses default message when none provided', async () => {
    const { result } = renderHook(() => useMutation())
    await act(() => result.current(() => Promise.reject(new Error())))
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something went wrong' })
    )
  })
})
