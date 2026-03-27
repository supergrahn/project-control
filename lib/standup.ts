import type { DashboardResponse } from './dashboard'
import type { AppEvent } from './events'

export function generateStandup(opts: {
  data: DashboardResponse
  events: AppEvent[]
  date?: Date
}): string {
  const now = opts.date ?? new Date()
  const dateStr = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const lines: string[] = [`# Standup — ${dateStr}`, '']

  // Yesterday — events from last 24h
  const recentEvents = opts.events.filter(e => new Date(e.createdAt) > yesterday)
  if (recentEvents.length > 0) {
    lines.push('## Yesterday')
    const byProject = new Map<string, string[]>()
    for (const e of recentEvents) {
      const key = e.projectId ?? 'general'
      if (!byProject.has(key)) byProject.set(key, [])
      byProject.get(key)!.push(e.summary)
    }
    for (const [, summaries] of byProject) {
      for (const s of summaries.slice(0, 5)) {
        lines.push(`- ${s}`)
      }
    }
    lines.push('')
  }

  // Today — Up Next items
  if (opts.data.upNext.length > 0) {
    lines.push('## Today')
    for (const item of opts.data.upNext.slice(0, 5)) {
      const action = item.stage === 'develop' ? 'Start developing' : item.stage === 'plan' ? 'Create plan for' : 'Write spec for'
      lines.push(`- **${item.projectName}**: ${action} ${item.featureName}`)
    }
    lines.push('')
  }

  // In Progress
  if (opts.data.inProgress.length > 0) {
    lines.push('## In Progress')
    for (const s of opts.data.inProgress) {
      lines.push(`- **${s.projectName}**: ${s.featureName} (${s.phase})`)
    }
    lines.push('')
  }

  // Blockers
  if (opts.data.health.blockers > 0) {
    lines.push('## Blockers')
    for (const w of opts.data.health.worst) {
      lines.push(`- **${w.projectName}**: ${w.planName} — ${w.blockers} blocker${w.blockers > 1 ? 's' : ''}`)
    }
    lines.push('')
  }

  if (recentEvents.length === 0 && opts.data.upNext.length === 0 && opts.data.inProgress.length === 0) {
    lines.push('*All quiet — no activity in the last 24 hours and nothing in the pipeline.*')
  }

  return lines.join('\n')
}
