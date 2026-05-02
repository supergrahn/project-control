import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localEmbed, getLocalEmbeddingModel } from '@/lib/router/localEmbed'
import type { Provider } from '@/lib/db/providers'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const provider = (config: object | null): Provider => ({
  id: 'p1',
  name: 'Local',
  type: 'ollama',
  command: 'llama',
  config: config ? JSON.stringify(config) : null,
  is_active: 1,
  created_at: '2026-05-01T00:00:00Z',
})

describe('localEmbed', () => {
  it('POSTs to /embeddings with model and input array', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          model: 'nomic-embed-text-v1.5',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const result = await localEmbed(
      provider({ baseUrl: 'http://localhost:8080/v1', embeddingModel: 'nomic-embed-text-v1.5' }),
      ['hello'],
      { timeoutMs: 5000 },
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:8080/v1/embeddings')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe('nomic-embed-text-v1.5')
    expect(body.input).toEqual(['hello'])

    expect(result.embeddings).toHaveLength(1)
    expect(result.embeddings[0]).toBeInstanceOf(Float32Array)
    expect(Array.from(result.embeddings[0])).toEqual([
      Math.fround(0.1),
      Math.fround(0.2),
      Math.fround(0.3),
    ])
    expect(result.dim).toBe(3)
    expect(result.model).toBe('nomic-embed-text-v1.5')
  })

  it('throws on non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('unavailable', { status: 503 }))
    await expect(
      localEmbed(provider(null), ['x'], { timeoutMs: 1000 }),
    ).rejects.toThrow(/503/)
  })

  it('aborts on timeout', async () => {
    fetchMock.mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          ;(init.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    await expect(
      localEmbed(provider(null), ['x'], { timeoutMs: 50 }),
    ).rejects.toThrow(/abort/i)
  })

  it('defaults to nomic-embed-text-v1.5 when embeddingModel is absent', () => {
    expect(getLocalEmbeddingModel(provider({}))).toBe('nomic-embed-text-v1.5')
    expect(getLocalEmbeddingModel(provider(null))).toBe('nomic-embed-text-v1.5')
  })
})
