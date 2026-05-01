import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localComplete } from '@/lib/router/localComplete'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const provider = (config: object | null) => ({
  id: 'p', name: 'L', type: 'ollama' as const, command: 'ollama',
  config: config ? JSON.stringify(config) : null,
  is_active: 1, created_at: '2026-05-01T00:00:00Z',
})

describe('localComplete', () => {
  it('posts to default baseUrl and returns the chat-completion content', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '  trivial\n' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const out = await localComplete(provider(null), 'classify this', { maxTokens: 10, timeoutMs: 5000 })

    expect(out).toBe('  trivial\n')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('llama3')
    expect(body.max_tokens).toBe(10)
    expect(body.messages[0]).toEqual({ role: 'user', content: 'classify this' })
    expect(body.stream).toBe(false)
    expect(body.temperature).toBe(0)
  })

  it('honors baseUrl + model from config', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'normal' } }],
    }), { status: 200 }))

    await localComplete(
      provider({ baseUrl: 'http://localhost:8080/v1', model: 'qwen-3.6:9b' }),
      'x',
      { maxTokens: 10, timeoutMs: 5000 },
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v1/chat/completions')
    expect(JSON.parse((init as RequestInit).body as string).model).toBe('qwen-3.6:9b')
  })

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 5000 }))
      .rejects.toThrow(/500/)
  })

  it('throws on malformed response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ wrong: 'shape' }), { status: 200 }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 5000 }))
      .rejects.toThrow()
  })

  it('aborts on timeout', async () => {
    fetchMock.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      ;(init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')))
    }))
    await expect(localComplete(provider(null), 'x', { maxTokens: 10, timeoutMs: 50 }))
      .rejects.toThrow(/abort/i)
  })
})
