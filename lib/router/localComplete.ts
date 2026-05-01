import type { Provider } from '@/lib/db/providers'

export type LocalCompleteOpts = {
  maxTokens: number
  timeoutMs: number
}

type ParsedConfig = { baseUrl?: string; model?: string }

const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
const DEFAULT_MODEL = 'llama3'

function parseConfig(provider: Provider): ParsedConfig {
  if (!provider.config) return {}
  try {
    return JSON.parse(provider.config) as ParsedConfig
  } catch {
    return {}
  }
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
