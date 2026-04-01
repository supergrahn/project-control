import type { ProviderType } from '@/lib/db/providers'
import type { AdapterModule } from './types'

const cache = new Map<ProviderType, AdapterModule>()

export function getAdapter(type: ProviderType): AdapterModule {
  const cached = cache.get(type)
  if (cached) return cached
  /* eslint-disable @typescript-eslint/no-require-imports */
  switch (type) {
    case 'claude': { const m = require('./claude'); cache.set(type, m.claudeAdapter); return m.claudeAdapter }
    case 'gemini': { const m = require('./gemini'); cache.set(type, m.geminiAdapter); return m.geminiAdapter }
    case 'codex':  { const m = require('./codex');  cache.set(type, m.codexAdapter);  return m.codexAdapter }
    case 'ollama': { const m = require('./ollama'); cache.set(type, m.ollamaAdapter); return m.ollamaAdapter }
  }
}
