import { describe, it, expect } from 'vitest'
import { evaluateRisk } from '@/lib/orchestrator-gate'

describe('evaluateRisk', () => {
  it('returns [] for benign content', () => {
    expect(evaluateRisk('Adding a dark mode toggle to the settings panel.')).toEqual([])
  })

  it('detects database migration', () => {
    expect(evaluateRisk('This spec includes a database migration to add the users table.')).toContain('database-migration')
    expect(evaluateRisk('ALTER TABLE sessions ADD COLUMN progress_steps TEXT')).toContain('database-migration')
  })

  it('detects auth keywords', () => {
    expect(evaluateRisk('Modify the auth middleware to use short-lived tokens.')).toContain('auth')
    expect(evaluateRisk('Session storage credentials are stored in the cookie.')).toContain('auth')
  })

  it('detects breaking changes', () => {
    expect(evaluateRisk('This is a breaking change to the public API contract.')).toContain('breaking-change')
  })

  it('detects test failures', () => {
    expect(evaluateRisk('3 tests failed in the test suite run.')).toContain('test-failure')
  })

  it('returns multiple flags', () => {
    const flags = evaluateRisk('Auth migration and breaking API change. 1 test failed.')
    expect(flags.length).toBeGreaterThanOrEqual(3)
  })
})
