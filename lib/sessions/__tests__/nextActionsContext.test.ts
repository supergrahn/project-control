import { describe, it, expect } from 'vitest'
import {
  parseNextActions,
  renderNextActionsContext,
  injectPriorNextActions,
  type ParsedNextActions,
} from '../nextActionsContext'
import type { Session } from '@/lib/db'

function makeSession(next_actions: string | null): Session {
  return { next_actions } as Session
}

const parsed: ParsedNextActions = {
  next_actions: ['add tests', 'document'],
  open_questions: ['is X needed?'],
  files_touched: [{ path: 'a.ts', change: 'modified' }],
  extracted_at: '2026-05-05T01:00:00.000Z',
  model: 'llama3',
}

describe('parseNextActions', () => {
  it('returns null when column is null', () => {
    expect(parseNextActions(makeSession(null))).toBeNull()
  })

  it('returns null when JSON is unparseable', () => {
    expect(parseNextActions(makeSession('{not-json'))).toBeNull()
  })

  it('returns null when next_actions is not an array', () => {
    expect(parseNextActions(makeSession(JSON.stringify({ next_actions: 'oops' })))).toBeNull()
  })

  it('returns parsed object on valid JSON', () => {
    const result = parseNextActions(makeSession(JSON.stringify(parsed)))
    expect(result).toEqual(parsed)
  })
})

describe('renderNextActionsContext', () => {
  it('includes marker, label, summary excerpt, steps, and questions', () => {
    const out = renderNextActionsContext({
      label: 'Spec session',
      summary: 'Wrote the helper.\nAlso updated tests.',
      parsed,
    })
    expect(out).toContain('<!-- next-actions:auto -->')
    expect(out).toContain('## Continuing from prior session')
    expect(out).toContain('**Spec session**')
    expect(out).toContain('Wrote the helper.')
    expect(out).not.toContain('Also updated tests.') // first line only
    expect(out).toContain('- add tests')
    expect(out).toContain('- document')
    expect(out).toContain('- is X needed?')
  })

  it('falls back to "(unlabeled)" for null/empty label', () => {
    const a = renderNextActionsContext({ label: null, summary: null, parsed })
    const b = renderNextActionsContext({ label: '', summary: null, parsed })
    expect(a).toContain('**(unlabeled)**')
    expect(b).toContain('**(unlabeled)**')
  })

  it('omits Open questions section when empty', () => {
    const out = renderNextActionsContext({
      label: 'l',
      summary: null,
      parsed: { ...parsed, open_questions: [] },
    })
    expect(out).not.toContain('Open questions')
  })

  it('omits Open next steps section when empty', () => {
    const out = renderNextActionsContext({
      label: 'l',
      summary: null,
      parsed: { ...parsed, next_actions: [] },
    })
    expect(out).not.toContain('Open next steps')
  })
})

describe('injectPriorNextActions', () => {
  it('returns originalContext unchanged when prior is null', () => {
    expect(injectPriorNextActions('user input', null)).toBe('user input')
  })

  it('returns originalContext unchanged when arrays are both empty', () => {
    expect(
      injectPriorNextActions('user input', {
        label: 'l',
        summary: null,
        parsed: { ...parsed, next_actions: [], open_questions: [] },
      }),
    ).toBe('user input')
  })

  it('prepends marker block above original input', () => {
    const out = injectPriorNextActions('user input', { label: 'l', summary: null, parsed })
    expect(out.startsWith('<!-- next-actions:auto -->')).toBe(true)
    expect(out).toContain('---\n\nuser input')
  })

  it('returns just the rendered block when originalContext is empty', () => {
    const out = injectPriorNextActions('', { label: 'l', summary: null, parsed })
    expect(out).toContain('<!-- next-actions:auto -->')
    expect(out.endsWith('---\n\n')).toBe(false)
  })

  it('is idempotent: second injection no-ops if marker is already present', () => {
    const once = injectPriorNextActions('user input', { label: 'l', summary: null, parsed })
    const twice = injectPriorNextActions(once, { label: 'l', summary: null, parsed })
    expect(twice).toBe(once)
  })
})
