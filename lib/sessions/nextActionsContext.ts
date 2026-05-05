import type { Session } from '@/lib/db'

export type ParsedNextActions = {
  next_actions: string[]
  open_questions: string[]
  files_touched: { path: string; change: string }[]
  extracted_at: string
  model: string
}

const MARKER = '<!-- next-actions:auto -->'

export function parseNextActions(session: Pick<Session, 'next_actions'>): ParsedNextActions | null {
  if (!session.next_actions) return null
  try {
    const parsed = JSON.parse(session.next_actions)
    if (!parsed || typeof parsed !== 'object') return null
    if (!Array.isArray((parsed as { next_actions?: unknown }).next_actions)) return null
    return parsed as ParsedNextActions
  } catch {
    return null
  }
}

export function renderNextActionsContext(prior: {
  label: string | null | undefined
  summary: string | null
  parsed: ParsedNextActions
}): string {
  const lines: string[] = [MARKER, '## Continuing from prior session']
  lines.push(`- Prior session: **${prior.label || '(unlabeled)'}**`)
  if (prior.summary) {
    const excerpt = prior.summary.split('\n')[0].slice(0, 200)
    lines.push(`- Last summary: ${excerpt}`)
  }
  if (prior.parsed.next_actions.length > 0) {
    lines.push('- Open next steps:')
    for (const a of prior.parsed.next_actions) lines.push(`  - ${a}`)
  }
  if (prior.parsed.open_questions.length > 0) {
    lines.push('- Open questions:')
    for (const q of prior.parsed.open_questions) lines.push(`  - ${q}`)
  }
  return lines.join('\n')
}

export function injectPriorNextActions(
  originalContext: string,
  prior: { label: string | null | undefined; summary: string | null; parsed: ParsedNextActions } | null,
): string {
  if (!prior) return originalContext
  if (originalContext.includes(MARKER)) return originalContext
  if (prior.parsed.next_actions.length === 0 && prior.parsed.open_questions.length === 0) return originalContext
  const rendered = renderNextActionsContext(prior)
  return originalContext.length > 0 ? `${rendered}\n\n---\n\n${originalContext}` : rendered
}
