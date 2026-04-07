import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scoreTask, rankTasks } from '@/lib/externalTasks/taskScoring'
import type { ExternalTask } from '@/lib/types/externalTask'

function makeTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
  return {
    id: 'task-1',
    source: 'jira',
    url: 'https://example.com/task-1',
    title: 'Test task',
    description: null,
    status: 'todo',
    priority: 'medium',
    project: 'TEST',
    labels: [],
    assignees: [],
    dueDate: null,
    createdAt: null,
    updatedAt: null,
    meta: {},
    ...overrides,
  }
}

describe('scoreTask', () => {
  const NOW = new Date('2026-04-07T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses default weight 1.5 when priority is null', () => {
    const task = makeTask({ priority: null, dueDate: null, updatedAt: null })
    // pw=1.5, df=1.5 (no due date), sf=2 (no updatedAt) => 1.5*1.5*2 = 4.5
    expect(scoreTask(task)).toBe(4.5)
  })

  it('scores critical priority higher than low priority', () => {
    const base = { dueDate: null, updatedAt: null }
    const critical = scoreTask(makeTask({ ...base, priority: 'critical' }))
    const low = scoreTask(makeTask({ ...base, priority: 'low' }))
    expect(critical).toBeGreaterThan(low)
  })

  it('scores overdue tasks with max due-date factor (5)', () => {
    const yesterday = new Date(NOW - 2 * 86_400_000).toISOString()
    const task = makeTask({ priority: 'high', dueDate: yesterday, updatedAt: new Date(NOW).toISOString() })
    // pw=3, df=5 (overdue), sf=1 (just updated) => 3*5*1 = 15
    expect(scoreTask(task)).toBe(15)
  })

  it('scores due today with factor 4', () => {
    const todayISO = new Date(NOW).toISOString()
    const task = makeTask({ priority: 'high', dueDate: todayISO, updatedAt: new Date(NOW).toISOString() })
    // pw=3, df=4 (< 1 day), sf=1 => 3*4*1 = 12
    expect(scoreTask(task)).toBe(12)
  })

  it('scores due within 7 days with factor 3', () => {
    const in3Days = new Date(NOW + 3 * 86_400_000).toISOString()
    const task = makeTask({ priority: 'medium', dueDate: in3Days, updatedAt: new Date(NOW).toISOString() })
    // pw=2, df=3, sf=1 => 6
    expect(scoreTask(task)).toBe(6)
  })

  it('caps staleness factor at 5', () => {
    // 100 days old => daysSince/14 >> 4, capped at 5
    const oldDate = new Date(NOW - 100 * 86_400_000).toISOString()
    const task = makeTask({ priority: 'low', dueDate: null, updatedAt: oldDate })
    // pw=1, df=1.5, sf=5 => 7.5
    expect(scoreTask(task)).toBe(7.5)
  })

  it('rounds to 1 decimal place', () => {
    const in10Days = new Date(NOW + 10 * 86_400_000).toISOString()
    // pw=1.5 (null priority), df=2 (< 14 days), sf=2 (no updatedAt) => 1.5*2*2 = 6
    const task = makeTask({ priority: null, dueDate: in10Days, updatedAt: null })
    expect(scoreTask(task)).toBe(6)
  })
})

describe('rankTasks', () => {
  const NOW = new Date('2026-04-07T12:00:00Z').getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters out done tasks', () => {
    const tasks = [
      makeTask({ id: '1', status: 'done', priority: 'critical' }),
      makeTask({ id: '2', status: 'todo', priority: 'low' }),
    ]
    const ranked = rankTasks(tasks)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('2')
  })

  it('returns tasks sorted by score descending', () => {
    const yesterday = new Date(NOW - 86_400_000).toISOString()
    const tasks = [
      makeTask({ id: 'low', priority: 'low', dueDate: null, updatedAt: null }),
      makeTask({ id: 'critical-overdue', priority: 'critical', dueDate: yesterday, updatedAt: null }),
      makeTask({ id: 'medium', priority: 'medium', dueDate: null, updatedAt: null }),
    ]
    const ranked = rankTasks(tasks)
    expect(ranked[0].id).toBe('critical-overdue')
    expect(ranked[ranked.length - 1].id).toBe('low')
  })

  it('attaches score to each task', () => {
    const tasks = [makeTask({ id: '1', priority: 'high', dueDate: null, updatedAt: null })]
    const ranked = rankTasks(tasks)
    expect(typeof ranked[0].score).toBe('number')
    expect(ranked[0].score).toBeGreaterThan(0)
  })

  it('returns empty array for empty input', () => {
    expect(rankTasks([])).toEqual([])
  })
})
