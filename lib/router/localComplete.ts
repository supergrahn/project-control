import type { Provider } from '@/lib/db/providers'
import {
  parseLocalProviderConfig as parseConfig,
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
} from './providerConfig'

export type LocalCompleteOpts = {
  maxTokens: number
  timeoutMs: number
}

/**
 * Return the model identifier that `localComplete` will use for this provider.
 * Useful for surfacing the real model name in PrepNotes / telemetry without
 * forcing every caller of `localComplete` to also unpack the response shape.
 */
export function getLocalModelName(provider: Provider): string {
  return parseConfig(provider).model ?? DEFAULT_MODEL
}

export async function localComplete(
  provider: Provider,
  prompt: string,
  opts: LocalCompleteOpts,
): Promise<string> {
  const cfg = parseConfig(provider)
  const baseUrl = (cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = cfg.model ?? DEFAULT_MODEL

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: opts.maxTokens,
        temperature: 0,
        stream: false,
      }),
      signal: ctrl.signal,
    })

    if (!res.ok) {
      throw new Error(`localComplete: HTTP ${res.status}`)
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = json.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new Error('localComplete: malformed response (missing choices[0].message.content)')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}
