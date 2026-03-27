import { describe, it, expect } from 'vitest'
import { getSystemPrompt } from '../prompts'

describe('ideate phase', () => {
  it('includes the source file path in the prompt', () => {
    const prompt = getSystemPrompt('ideate', '/data/ideas/my-idea.md')
    expect(prompt).toContain('/data/ideas/my-idea.md')
  })

  it('mentions consult-gemini skill opportunistically', () => {
    const prompt = getSystemPrompt('ideate', '/data/ideas/my-idea.md')
    expect(prompt).toContain('consult-gemini')
  })
})
