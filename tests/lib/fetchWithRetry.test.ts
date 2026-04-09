import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from '@/lib/fetcher'

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns response on first success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 500 and returns on subsequent success', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValue(new Response('ok', { status: 200 }))
    )
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 3, timeoutMs: 10_000 })
    await vi.runAllTimersAsync()
    const res = await promise
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })))
    const res = await fetchWithRetry('https://example.com')
    expect(res.status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws after exhausting retries on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })))
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 2, timeoutMs: 10_000 })
    await vi.runAllTimersAsync()
    await expect(promise).rejects.toThrow('HTTP 500')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws timeout error when request takes too long', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    }))
    const promise = fetchWithRetry('https://example.com', undefined, { retries: 1, timeoutMs: 5000 })
    await vi.advanceTimersByTimeAsync(5001)
    await expect(promise).rejects.toThrow('timed out')
  })
})
