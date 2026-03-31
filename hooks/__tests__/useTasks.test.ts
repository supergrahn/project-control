import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTasks, useTask } from '@/hooks/useTasks'

global.fetch = vi.fn()

describe('useTasks', () => {
  it('fetches tasks for a project and status', async () => {
    const mockTasks = [{ id: '1', title: 'Test', status: 'idea' }]
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTasks,
    } as Response)

    const { result } = renderHook(() => useTasks('proj-1', 'idea'))
    await waitFor(() => expect(result.current.tasks).toEqual(mockTasks))
  })
})

describe('useTask', () => {
  it('returns undefined while loading', () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {}))
    const { result } = renderHook(() => useTask('task-1'))
    expect(result.current.task).toBeUndefined()
  })
})
