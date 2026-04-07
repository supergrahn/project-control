import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getDueDateStatus, getStaleStatus } from '@/lib/externalTasks/dueDate'

describe('getDueDateStatus', () => {
  const NOW = new Date('2026-04-07T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for null input', () => {
    expect(getDueDateStatus(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(getDueDateStatus(undefined)).toBeNull()
  })

  it('returns overdue for a past date', () => {
    expect(getDueDateStatus('2026-04-06')).toBe('overdue')
  })

  it('returns due-today for today', () => {
    expect(getDueDateStatus('2026-04-07')).toBe('due-today')
  })

  it('returns upcoming for a future date', () => {
    expect(getDueDateStatus('2026-04-08')).toBe('upcoming')
  })

  it('returns upcoming for a far future date', () => {
    expect(getDueDateStatus('2027-01-01')).toBe('upcoming')
  })

  it('uses UTC date comparison (not local time)', () => {
    // ISO datetime on today's UTC date should still be due-today
    expect(getDueDateStatus('2026-04-07T23:59:59Z')).toBe('due-today')
  })
})

describe('getStaleStatus', () => {
  const NOW = new Date('2026-04-07T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns false for null', () => {
    expect(getStaleStatus(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(getStaleStatus(undefined)).toBe(false)
  })

  it('returns false when updated less than 7 days ago', () => {
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(getStaleStatus(threeDaysAgo)).toBe(false)
  })

  it('returns false when updated exactly 7 days ago (boundary)', () => {
    const exactly7Days = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString()
    // exactly 7 days = not greater than 7 days
    expect(getStaleStatus(exactly7Days)).toBe(false)
  })

  it('returns true when updated more than 7 days ago', () => {
    const eightDaysAgo = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(getStaleStatus(eightDaysAgo)).toBe(true)
  })

  it('returns true for very old dates', () => {
    expect(getStaleStatus('2020-01-01T00:00:00Z')).toBe(true)
  })
})
