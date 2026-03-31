import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('swr', () => {
  const mockMutate = vi.fn()
  return {
    mutate: mockMutate,
  }
})

import { stopSession } from '../sessionActions'
import * as swrModule from 'swr'

const mockFetch = vi.fn()
global.fetch = mockFetch

const mockMutate = (swrModule as any).mutate

describe('stopSession', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockMutate.mockReset()
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('DELETEs the session endpoint', async () => {
    await stopSession('sess-123')
    expect(mockFetch).toHaveBeenCalledWith('/api/sessions/sess-123', { method: 'DELETE' })
  })

  it('invalidates the SWR sessions cache', async () => {
    await stopSession('sess-123')
    expect(mockMutate).toHaveBeenCalledWith(expect.any(Function))
    // verify predicate matches session URLs
    const predicate = mockMutate.mock.calls[0][0]
    expect(predicate('/api/sessions?status=active')).toBe(true)
    expect(predicate('/api/tasks?projectId=x')).toBe(false)
  })

  it('does not invalidate cache when DELETE fails', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    await stopSession('sess-123')
    expect(mockMutate).not.toHaveBeenCalled()
  })
})
