import type { ProviderType } from '@/lib/db/providers'

const PATTERNS: Record<ProviderType, RegExp[]> = {
  claude:  [/rate_limit_exceeded/, /overloaded_error/, /\b529\b/],
  codex:   [/rate_limit_exceeded/, /quota_exceeded/, /(?<!=\s*)\b429\b(?!\s*[=;,)])/],
  gemini:  [/RESOURCE_EXHAUSTED/, /quota exceeded/i, /(?<!=\s*)\b429\b(?!\s*[=;,)])/],
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
