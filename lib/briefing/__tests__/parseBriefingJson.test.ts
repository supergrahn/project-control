// lib/briefing/__tests__/parseBriefingJson.test.ts
import { describe, it, expect } from 'vitest'
import { parseBriefingJson } from '../parseBriefingJson'

const VALID_JSON = JSON.stringify({
  narrative: 'Focus on the failing tests today.',
  priority_actions: [
    { sectionKey: 'next_actions', refId: 'session-1', reason: 'Has open actions.' },
  ],
})

describe('parseBriefingJson', () => {
  it('returns null for plain bad JSON', () => {
    expect(parseBriefingJson('{not-json')).toBeNull()
  })

  it('salvages JSON wrapped in prose', () => {
    const wrapped = `Here is the briefing: ${VALID_JSON} done.`
    const result = parseBriefingJson(wrapped)
    expect(result).not.toBeNull()
    expect(result!.narrative).toBe('Focus on the failing tests today.')
    expect(result!.priorityActions).toHaveLength(1)
  })

  it('returns null when narrative is missing', () => {
    const raw = JSON.stringify({ priority_actions: [] })
    expect(parseBriefingJson(raw)).toBeNull()
  })

  it('returns null when narrative is empty string', () => {
    const raw = JSON.stringify({ narrative: '', priority_actions: [] })
    expect(parseBriefingJson(raw)).toBeNull()
  })

  it('returns null when narrative is not a string (number)', () => {
    const raw = JSON.stringify({ narrative: 42, priority_actions: [] })
    expect(parseBriefingJson(raw)).toBeNull()
  })

  it('returns valid result when priority_actions is not an array (treats as empty)', () => {
    const raw = JSON.stringify({ narrative: 'Some text.', priority_actions: 'not an array' })
    const result = parseBriefingJson(raw)
    expect(result).not.toBeNull()
    expect(result!.narrative).toBe('Some text.')
    expect(result!.priorityActions).toHaveLength(0)
  })

  it('filters invalid sectionKey, empty refId, missing reason; keeps valid ones', () => {
    const raw = JSON.stringify({
      narrative: 'Summary here.',
      priority_actions: [
        { sectionKey: 'bad_section', refId: 'r1', reason: 'ok' },         // invalid sectionKey
        { sectionKey: 'next_actions', refId: '', reason: 'ok' },           // empty refId
        { sectionKey: 'top_tasks', refId: 'r2', reason: '' },              // empty reason
        { sectionKey: 'top_tasks', refId: 'r3' },                          // missing reason
        { sectionKey: 'critic_flagged', refId: 'r4', reason: 'valid' },    // valid
      ],
    })
    const result = parseBriefingJson(raw)
    expect(result).not.toBeNull()
    expect(result!.priorityActions).toHaveLength(1)
    expect(result!.priorityActions[0].refId).toBe('r4')
  })

  it('filters refIds not present in validRefIdsBySection', () => {
    const raw = JSON.stringify({
      narrative: 'Summary.',
      priority_actions: [
        { sectionKey: 'next_actions', refId: 'session-valid', reason: 'Fine.' },
        { sectionKey: 'next_actions', refId: 'session-invalid', reason: 'Also fine.' },
        { sectionKey: 'top_tasks', refId: 'task-valid', reason: 'Good.' },
      ],
    })
    const validRefIdsBySection = {
      next_actions: new Set(['session-valid']),
      critic_flagged: new Set<string>(),
      top_tasks: new Set(['task-valid']),
      recent_failures: new Set<string>(),
      duplicate_tasks: new Set<string>(),
    }
    const result = parseBriefingJson(raw, validRefIdsBySection)
    expect(result).not.toBeNull()
    expect(result!.priorityActions).toHaveLength(2)
    expect(result!.priorityActions.map(a => a.refId)).toEqual(['session-valid', 'task-valid'])
  })

  it('caps priority_actions to 6 items', () => {
    const actions = Array.from({ length: 10 }, (_, i) => ({
      sectionKey: 'next_actions',
      refId: `session-${i}`,
      reason: 'Some reason.',
    }))
    const raw = JSON.stringify({ narrative: 'Many actions.', priority_actions: actions })
    const result = parseBriefingJson(raw)
    expect(result).not.toBeNull()
    expect(result!.priorityActions).toHaveLength(6)
  })

  it('returns null when parsed value is an array', () => {
    const raw = JSON.stringify([{ narrative: 'text' }])
    expect(parseBriefingJson(raw)).toBeNull()
  })
})
