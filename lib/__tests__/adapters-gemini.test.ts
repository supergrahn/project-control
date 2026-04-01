import { describe, it, expect } from 'vitest'
import { geminiAdapter } from '@/lib/sessions/adapters/gemini'

describe('geminiAdapter.buildArgs', () => {
  it('builds args with -p and --output-format stream-json', () => {
    const args = geminiAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-123')
    const pIdx = args.indexOf('-p')
    expect(args[pIdx + 1]).toContain('Fix the bug')
  })
})

describe('geminiAdapter.resumeArgs', () => {
  it('builds resume args with --session-id', () => {
    const args = geminiAdapter.resumeArgs('sess-abc')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-abc')
  })
})

describe('geminiAdapter.parseLine', () => {
  it('parses init event', () => {
    const line = JSON.stringify({ type: 'init', session_id: 's1', model: 'auto-gemini-3', timestamp: '2026-04-01T09:00:00Z' })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 's1', model: 'auto-gemini-3', provider: 'gemini' },
    })
  })

  it('parses assistant message event', () => {
    const line = JSON.stringify({ type: 'message', role: 'assistant', content: 'The answer is 4.', delta: true, timestamp: '2026-04-01T09:00:01Z' })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'The answer is 4.',
      metadata: { delta: true },
    })
  })

  it('parses result event with stats', () => {
    const line = JSON.stringify({
      type: 'result',
      status: 'success',
      stats: { total_tokens: 13404, input_tokens: 13290, output_tokens: 32, cached: 0, duration_ms: 16892, tool_calls: 0 },
    })
    const event = geminiAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 13290, output: 32, cached: 0, costUsd: 0 },
    })
  })

  it('returns raw event for unparseable line', () => {
    const event = geminiAdapter.parseLine('garbage')
    expect(event).toEqual({ type: 'raw', content: 'garbage' })
  })

  it('returns null for empty line', () => {
    expect(geminiAdapter.parseLine('')).toBeNull()
  })
})

describe('geminiAdapter.rateLimitPatterns', () => {
  it('detects RESOURCE_EXHAUSTED', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('RESOURCE_EXHAUSTED'))).toBe(true)
  })
  it('detects quota exceeded', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('quota exceeded for project'))).toBe(true)
  })
  it('detects 429', () => {
    expect(geminiAdapter.rateLimitPatterns.some(p => p.test('429 from API'))).toBe(true)
  })
})
