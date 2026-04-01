import { describe, it, expect } from 'vitest'
import { codexAdapter } from '@/lib/sessions/adapters/codex'

describe('codexAdapter.buildArgs', () => {
  it('builds args with exec subcommand', () => {
    const args = codexAdapter.buildArgs({
      systemPrompt: 'You are helpful',
      userContext: 'Fix the bug',
      permissionMode: 'default',
      sessionId: 'sess-123',
    })
    expect(args[0]).toBe('exec')
    expect(args[1]).toContain('Fix the bug')
  })
})

describe('codexAdapter.resumeArgs', () => {
  it('builds resume args with --session-id', () => {
    const args = codexAdapter.resumeArgs('sess-abc')
    expect(args[0]).toBe('exec')
    expect(args).toContain('--session-id')
    expect(args).toContain('sess-abc')
  })
})

describe('codexAdapter.parseLine', () => {
  it('parses thread.started event', () => {
    const line = JSON.stringify({ type: 'thread.started', thread_id: 't1' })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'init',
      metadata: { sessionId: 't1', model: 'codex', provider: 'codex' },
    })
  })

  it('parses item.completed with agent message', () => {
    const line = JSON.stringify({ type: 'item.completed', item: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] } })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'message',
      role: 'assistant',
      content: 'Done',
    })
  })

  it('parses turn.completed with usage', () => {
    const line = JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 500, output_tokens: 100 } })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'tokens',
      metadata: { input: 500, output: 100, cached: 0, costUsd: 0 },
    })
  })

  it('parses turn.failed as error', () => {
    const line = JSON.stringify({ type: 'turn.failed', error: 'something broke' })
    const event = codexAdapter.parseLine(line)
    expect(event).toEqual({
      type: 'error',
      content: 'something broke',
      metadata: { code: 'turn.failed', isRateLimit: false },
    })
  })

  it('returns raw for unparseable', () => {
    expect(codexAdapter.parseLine('nope')).toEqual({ type: 'raw', content: 'nope' })
  })

  it('returns null for empty', () => {
    expect(codexAdapter.parseLine('')).toBeNull()
  })
})

describe('codexAdapter.rateLimitPatterns', () => {
  it('detects rate_limit_exceeded', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('rate_limit_exceeded'))).toBe(true)
  })
  it('detects quota_exceeded', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('quota_exceeded'))).toBe(true)
  })
  it('detects 429', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('Response 429'))).toBe(true)
  })
  it('ignores const x = 429', () => {
    expect(codexAdapter.rateLimitPatterns.some(p => p.test('const x = 429'))).toBe(false)
  })
})
