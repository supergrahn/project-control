import type { ProviderType } from '@/lib/db/providers'

const HTTP_429 = /(?<![=]\s{0,5})\b429\b/

const PATTERNS: Record<ProviderType, RegExp[]> = {
  claude:  [/rate_limit_exceeded/, /overloaded_error/, /\b529\b/],
  codex:   [/rate_limit_exceeded/, /quota_exceeded/, HTTP_429],
  gemini:  [/RESOURCE_EXHAUSTED/, /quota exceeded/i, HTTP_429],
  ollama:  [],
}

export class RateLimitDetector {
  private patterns: RegExp[]

  constructor(providerType: ProviderType) {
    this.patterns = PATTERNS[providerType] ?? []
  }

  check(text: string): boolean {
    return this.patterns.some(p => p.test(text))
  }
}
