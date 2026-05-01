import type { PrepNotes } from './types'

/**
 * Render a PrepNotes packet to a markdown body suitable for both
 * task_comments insertion and userContext injection at session spawn.
 */
export function renderPrepAsMarkdown(notes: PrepNotes): string {
  const lines: string[] = []
  lines.push('## Prep')
  lines.push('')
  lines.push(notes.summary)

  if (notes.intent && notes.intent.trim()) {
    lines.push('')
    lines.push('**Intent:** ' + notes.intent)
  }

  if (notes.files.length > 0) {
    lines.push('')
    lines.push('**Likely-relevant files:**')
    for (const f of notes.files) {
      lines.push('- `' + f.path + '` — ' + f.why)
    }
  }

  if (notes.open_questions.length > 0) {
    lines.push('')
    lines.push('**Open questions:**')
    for (const q of notes.open_questions) {
      lines.push(`- ${q}`)
    }
  }

  lines.push('')
  lines.push(`<sub>Prepped ${notes.generated_at} by ${notes.model}</sub>`)
  return lines.join('\n')
}
