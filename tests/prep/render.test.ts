import { describe, expect, it } from 'vitest'
import { renderPrepAsMarkdown } from '@/lib/prep/render'
import type { PrepNotes } from '@/lib/prep/types'

describe('renderPrepAsMarkdown', () => {
  it('renders all sections of a complete prep packet', () => {
    const notes: PrepNotes = {
      summary: 'User can\'t log in with SSO.',
      intent: 'Likely a callback URL mismatch after the deploy.',
      files: [
        { path: 'lib/auth/sso.ts', why: 'callback handler' },
        { path: 'lib/auth/config.ts', why: 'redirect URL config' },
      ],
      open_questions: ['Which SSO provider is failing — Okta or Azure?'],
      generated_at: '2026-05-01T12:00:00.000Z',
      model: 'qwen-3.6:9b',
    }
    const out = renderPrepAsMarkdown(notes)
    expect(out).toContain('User can\'t log in with SSO.')
    expect(out).toContain('callback URL mismatch')
    // Pin the exact bullet shape (backticks + em-dash) so a future regression
    // to plain "- path why" gets caught.
    expect(out).toContain('- `lib/auth/sso.ts` — callback handler')
    expect(out).toContain('- `lib/auth/config.ts` — redirect URL config')
    expect(out).toContain('Okta or Azure')
    expect(out).toContain('qwen-3.6:9b')
  })

  it('omits empty sections cleanly', () => {
    const notes: PrepNotes = {
      summary: 'Short summary.',
      intent: '',
      files: [],
      open_questions: [],
      generated_at: '2026-05-01T12:00:00.000Z',
      model: 'llama3',
    }
    const out = renderPrepAsMarkdown(notes)
    expect(out).toContain('Short summary.')
    // Use exact-string assertions so a re-cased header (or a re-introduced
    // empty header) gets caught — the previous /Files:?/ regex was a no-op
    // because the real header is `**Likely-relevant files:**`.
    expect(out).not.toContain('**Likely-relevant files:**')
    expect(out).not.toContain('**Open questions:**')
    expect(out).not.toContain('**Intent:**')
  })
})
