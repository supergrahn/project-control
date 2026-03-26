import { describe, it, expect } from 'vitest'
import { getSystemPrompt, buildArgs } from '@/lib/prompts'

describe('getSystemPrompt', () => {
  it('returns a non-empty string for each action type', () => {
    const phases = ['brainstorm', 'spec', 'plan', 'develop', 'review'] as const
    for (const phase of phases) {
      const prompt = getSystemPrompt(phase, '/path/to/file.md')
      expect(prompt.length).toBeGreaterThan(20)
      expect(prompt).toContain('/path/to/file.md')
    }
  })
})

describe('buildArgs', () => {
  it('includes system prompt and user context', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: 'ctx', permissionMode: 'default', sessionId: 'abc' })
    expect(args).toContain('--system-prompt')
    expect(args).toContain('sys')
    expect(args).toContain('ctx')
    expect(args).toContain('--session-id')
    expect(args).toContain('abc')
  })

  it('omits user context when empty', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: '', permissionMode: 'default', sessionId: 'abc' })
    expect(args[args.length - 1]).not.toBe('')
    expect(args).not.toContain('')
  })

  it('sets correct permission-mode flag', () => {
    const args = buildArgs({ systemPrompt: 'sys', userContext: '', permissionMode: 'bypassPermissions', sessionId: 'abc' })
    expect(args).toContain('bypassPermissions')
  })
})
