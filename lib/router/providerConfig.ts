import type { Provider } from '@/lib/db/providers'

export type LocalProviderConfig = {
  baseUrl?: string
  model?: string
  embeddingModel?: string
}

export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'
export const DEFAULT_MODEL = 'llama3'
export const DEFAULT_EMBEDDING_MODEL = 'nomic-embed-text-v1.5'

export function parseLocalProviderConfig(provider: Provider): LocalProviderConfig {
  if (!provider.config) return {}
  try {
    return JSON.parse(provider.config) as LocalProviderConfig
  } catch {
    return {}
  }
}
