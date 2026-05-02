import type { Provider } from '@/lib/db/providers'
import {
  parseLocalProviderConfig,
  DEFAULT_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
} from './providerConfig'

export type LocalEmbedOpts = { timeoutMs: number }

/**
 * Return the embedding model identifier that `localEmbed` will use for this
 * provider. Surfaces the resolved model name without forcing callers to unpack
 * the response shape.
 */
export function getLocalEmbeddingModel(provider: Provider): string {
  return parseLocalProviderConfig(provider).embeddingModel ?? DEFAULT_EMBEDDING_MODEL
}

export async function localEmbed(
  provider: Provider,
  inputs: string[],
  opts: LocalEmbedOpts,
): Promise<{ embeddings: Float32Array[]; model: string; dim: number }> {
  const cfg = parseLocalProviderConfig(provider)
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = cfg.embeddingModel ?? DEFAULT_EMBEDDING_MODEL

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: inputs }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      throw new Error(`localEmbed: HTTP ${res.status}`)
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding: number[] }>
      model?: string
    }
    if (!json.data || json.data.length === 0) {
      throw new Error('localEmbed: empty data')
    }
    const embeddings = json.data.map((d) => Float32Array.from(d.embedding))
    return {
      embeddings,
      model: json.model ?? model,
      dim: embeddings[0].length,
    }
  } finally {
    clearTimeout(timer)
  }
}
