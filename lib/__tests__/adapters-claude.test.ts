import { describe, it, expect } from 'vitest'
import { claudeAdapter } from '@/lib/sessions/adapters/claude'

describe('claudeAdapter.buildArgs', () => {
  it('builds args with --print --output-format stream-json', () => {
    const args = claudeAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--system-prompt')
    expect(args).toContain('You are helpful')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-123')
    expect(args).toContain('--permission-mode')
    expect(args).toContain('default')
    expect(args[args.length - 1]).toBe('Fix the bug')
  })

  it('omits trailing user context when empty', () => {
    const args = claudeAdapter.buildArgs({
      systemPrompt: 'prompt',
      userContext: '  ',
      permissionMode: 'default',
      sessionId: 'sess-1',
    })
    expect(args[args.length - 1]).not.toBe('  ')
  })
})

describe('claudeAdapter.resumeArgs', () => {
  it('builds resume args with --resume flag', () => {
    const args = claudeAdapter.resumeArgs('sess-abc')
    expect(args).toContain('--print')
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
    expect(args).toContain('--resume')
    expect(args).toContain('sess-abc')
  })
})

describe('claudeAdapter.parseLine', () => {
  it('parses system init event', () => {
    const line = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', model: 'claude-sonnet-4-5-20250514' })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 's1', model: 'claude-sonnet-4-5-20250514', provider: 'claude' },
    })
  })

  it('parses assistant message event', () => {
    const line = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello world' }] } })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'Hello world',
    })
  })

  it('parses result event with usage', () => {
    const line = JSON.stringify({
      type: 'result',
      usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50 },
      total_cost_usd: 0.003,
    })
    const event = claudeAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 1000, output: 200, cached: 50, costUsd: 0.003 },
    })
  })

  it('returns raw event for unparseable line', () => {
    const event = claudeAdapter.parseLine('not json at all')
    expect(event).toEqual({ type: 'raw', content: 'not json at all' })
  })

  it('returns null for empty line', () => {
    expect(claudeAdapter.parseLine('')).toBeNull()
    expect(claudeAdapter.parseLine('  ')).toBeNull()
  })
})

describe('claudeAdapter.rateLimitPatterns', () => {
  it('detects rate_limit_exceeded', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('rate_limit_exceeded'))).toBe(true)
  })
  it('detects overloaded_error', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('overloaded_error'))).toBe(true)
  })
  it('detects 529', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('HTTP 529 Overloaded'))).toBe(true)
  })
  it('ignores normal text', () => {
    expect(claudeAdapter.rateLimitPatterns.some(p => p.test('Reading file'))).toBe(false)
  })
})
