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

// --- Filesystem tests ---

import { buildFeatureMap } from '@/lib/dashboard'
import fss from 'fs'
import pathMod from 'path'
import os from 'os'
import { beforeEach, afterEach } from 'vitest'

describe('buildFeatureMap', () => {
  let tmpDir: string
  let ideasDir: string
  let specsDir: string
  let plansDir: string

  beforeEach(() => {
    tmpDir = fss.mkdtempSync(pathMod.join(os.tmpdir(), 'dashboard-test-'))
    ideasDir = pathMod.join(tmpDir, 'ideas')
    specsDir = pathMod.join(tmpDir, 'specs')
    plansDir = pathMod.join(tmpDir, 'plans')
    fss.mkdirSync(ideasDir, { recursive: true })
    fss.mkdirSync(specsDir, { recursive: true })
    fss.mkdirSync(plansDir, { recursive: true })
  })

  afterEach(() => {
    fss.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('maps files across dirs by stripped basename', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'auth-system.md'), '# Auth')
    fss.writeFileSync(pathMod.join(specsDir, '2026-03-26-auth-system.md'), '# Auth Spec')
    fss.writeFileSync(pathMod.join(plansDir, '2026-03-26-auth-system.md'), '# Auth Plan')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    expect(map.size).toBe(1)
    const entry = map.get('auth-system')!
    expect(entry.idea).toContain('auth-system.md')
    expect(entry.spec).toContain('auth-system.md')
    expect(entry.plan).toContain('auth-system.md')
    expect(entry.originalBasenames.plan).toBe('2026-03-26-auth-system')
  })

  it('reads frontmatter status from files', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'done-feature.md'), '---\nstatus: done\n---\n# Done')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    const entry = map.get('done-feature')!
    expect(entry.frontmatterStatus).toBe('done')
  })

  it('reads audit files for plans', () => {
    fss.writeFileSync(pathMod.join(plansDir, 'my-plan.md'), '# Plan')
    const auditsDir = pathMod.join(plansDir, 'audits')
    fss.mkdirSync(auditsDir, { recursive: true })
    fss.writeFileSync(pathMod.join(auditsDir, 'my-plan-audit-2026-03-26.md'), '---\nblockers: 2\nwarnings: 1\naudited_at: 2026-03-26\nplan_file: my-plan.md\n---\n\n# Audit')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    const entry = map.get('my-plan')!
    expect(entry.audit).toEqual({ blockers: 2, warnings: 1 })
  })

  it('ignores non-.md files', () => {
    fss.writeFileSync(pathMod.join(ideasDir, 'notes.txt'), 'not markdown')
    fss.writeFileSync(pathMod.join(ideasDir, 'real-idea.md'), '# Real')

    const map = buildFeatureMap(tmpDir, { ideas_dir: 'ideas', specs_dir: 'specs', plans_dir: 'plans' })
    expect(map.size).toBe(1)
    expect(map.has('real-idea')).toBe(true)
  })

  it('returns empty map when dirs do not exist', () => {
    const map = buildFeatureMap(tmpDir, { ideas_dir: 'nonexistent', specs_dir: null, plans_dir: null })
    expect(map.size).toBe(0)
  })
})
