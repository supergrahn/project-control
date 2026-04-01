import { describe, it, expect } from 'vitest'
import { ollamaAdapter } from '@/lib/sessions/adapters/ollama'

describe('ollamaAdapter.buildArgs', () => {
  it('builds args with run subcommand', () => {
    const args = ollamaAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args[0]).toBe('run')
  })
})

describe('ollamaAdapter.resumeArgs', () => {
  it('returns empty array (no resume support)', () => {
    expect(ollamaAdapter.resumeArgs('sess-abc')).toEqual([])
  })
})

describe('ollamaAdapter.parseLine', () => {
  it('returns all lines as raw events', () => {
    const event = ollamaAdapter.parseLine('Here is your answer')
    expect(event).toEqual({ type: 'raw', content: 'Here is your answer' })
  })

  it('returns null for empty lines', () => {
    expect(ollamaAdapter.parseLine('')).toBeNull()
  })
})

describe('ollamaAdapter.rateLimitPatterns', () => {
  it('has no patterns', () => {
    expect(ollamaAdapter.rateLimitPatterns).toHaveLength(0)
  })
})
