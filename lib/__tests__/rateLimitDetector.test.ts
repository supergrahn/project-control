import { describe, it, expect } from 'vitest'
import { RateLimitDetector } from '@/lib/sessions/rateLimitDetector'

describe('RateLimitDetector — claude', () => {
  const d = new RateLimitDetector('claude')
  it('detects rate_limit_exceeded', () => { expect(d.check('Error: rate_limit_exceeded')).toBe(true) })
  it('detects overloaded_error', () => { expect(d.check('{"type":"overloaded_error"}')).toBe(true) })
  it('detects 529', () => { expect(d.check('HTTP 529 Overloaded')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('Reading file src/index.ts')).toBe(false) })
})

describe('RateLimitDetector — codex', () => {
  const d = new RateLimitDetector('codex')
  it('detects rate_limit_exceeded', () => { expect(d.check('rate_limit_exceeded: wait')).toBe(true) })
  it('detects quota_exceeded', () => { expect(d.check('quota_exceeded for plan')).toBe(true) })
  it('detects 429', () => { expect(d.check('Response 429 Too Many Requests')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('const x = 429')).toBe(false) })
})

describe('RateLimitDetector — gemini', () => {
  const d = new RateLimitDetector('gemini')
  it('detects RESOURCE_EXHAUSTED', () => { expect(d.check('Status: RESOURCE_EXHAUSTED')).toBe(true) })
  it('detects quota exceeded (case-insensitive)', () => { expect(d.check('quota exceeded for project')).toBe(true) })
  it('detects 429', () => { expect(d.check('429 from Gemini API')).toBe(true) })
  it('ignores normal output', () => { expect(d.check('Resource loading complete')).toBe(false) })
})

describe('RateLimitDetector — ollama', () => {
  const d = new RateLimitDetector('ollama')
  it('never triggers', () => {
    expect(d.check('rate_limit_exceeded')).toBe(false)
    expect(d.check('RESOURCE_EXHAUSTED')).toBe(false)
    expect(d.check('429')).toBe(false)
  })
})
