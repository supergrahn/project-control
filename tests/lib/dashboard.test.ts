// tests/lib/dashboard.test.ts
import { describe, it, expect } from 'vitest'
import { stripDatePrefix, inferStage, applyOverrides, detectStale, type FeatureEntry, type Stage } from '@/lib/dashboard'

function makeEntry(overrides: Partial<FeatureEntry> = {}): FeatureEntry {
  return {
    key: 'test-feature',
    originalBasenames: {},
    idea: null,
    spec: null,
    plan: null,
    audit: null,
    latestModified: new Date('2026-03-26'),
    frontmatterStatus: null,
    ...overrides,
  }
}

describe('stripDatePrefix', () => {
  it('strips YYYY-MM-DD- prefix', () => {
    expect(stripDatePrefix('2026-03-26-auth-system.md')).toBe('auth-system.md')
  })
  it('returns unchanged if no date prefix', () => {
    expect(stripDatePrefix('auth-system.md')).toBe('auth-system.md')
  })
  it('handles partial date-like prefix (no match)', () => {
    expect(stripDatePrefix('2026-03-auth.md')).toBe('2026-03-auth.md')
  })
  it('handles file that is only a date prefix', () => {
    expect(stripDatePrefix('2026-03-26-.md')).toBe('.md')
  })
})

describe('inferStage', () => {
  it('rule 1: plan + active session → inProgress', () => {
    const entry = makeEntry({ plan: '/p/plan.md' })
    expect(inferStage(entry, true)).toBe('inProgress')
  })
  it('rule 2: plan + clean audit + no session → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md', audit: { blockers: 0, warnings: 0 } })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 3: plan + audit with issues → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md', audit: { blockers: 2, warnings: 0 } })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 4: plan + no audit → develop', () => {
    const entry = makeEntry({ plan: '/p/plan.md' })
    expect(inferStage(entry, false)).toBe('develop')
  })
  it('rule 5: spec + no plan → plan', () => {
    const entry = makeEntry({ spec: '/p/spec.md' })
    expect(inferStage(entry, false)).toBe('plan')
  })
  it('rule 6: idea + no spec → spec', () => {
    const entry = makeEntry({ idea: '/p/idea.md' })
    expect(inferStage(entry, false)).toBe('spec')
  })
  it('returns null when no files', () => {
    const entry = makeEntry()
    expect(inferStage(entry, false)).toBeNull()
  })
})

describe('applyOverrides', () => {
  it('status: done → null (excluded)', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'done' })
    expect(applyOverrides(entry, 'spec')).toBeNull()
  })
  it('status: skip → null (excluded)', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'skip' })
    expect(applyOverrides(entry, 'spec')).toBeNull()
  })
  it('status: ready → preserves inferred stage', () => {
    const entry = makeEntry({ idea: '/p/idea.md', frontmatterStatus: 'ready' })
    expect(applyOverrides(entry, 'spec')).toBe('spec')
  })
  it('status: ready → forces stage when inferred was null', () => {
    const entry = makeEntry({ frontmatterStatus: 'ready', idea: '/p/idea.md' })
    expect(applyOverrides(entry, null)).toBe('spec')
  })
  it('status: in-progress → preserves inferred stage', () => {
    const entry = makeEntry({ plan: '/p/plan.md', frontmatterStatus: 'in-progress' })
    expect(applyOverrides(entry, 'develop')).toBe('develop')
  })
  it('no status → passes through inferred stage', () => {
    const entry = makeEntry({ spec: '/p/spec.md' })
    expect(applyOverrides(entry, 'plan')).toBe('plan')
  })
})

describe('detectStale', () => {
  it('returns true when >7 days old and no status override', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-10') })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(true)
  })
  it('returns false when <7 days old', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-25') })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(false)
  })
  it('returns false when stale but has status override', () => {
    const entry = makeEntry({ plan: '/p/plan.md', latestModified: new Date('2026-03-10'), frontmatterStatus: 'in-progress' })
    expect(detectStale(entry, new Date('2026-03-27'))).toBe(false)
  })
})
