import type { DashboardResponse } from './dashboard'
import type { AppEvent } from './events'
import type { Insight } from './db'
import type { ProjectGitActivity } from './git-activity'

export function generateWeeklyReview(opts: {
  data: DashboardResponse
  events: AppEvent[]
  insights: Insight[]
  gitActivity: ProjectGitActivity[]
}): string {
  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const dateRange = `${weekStart.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`

  const lines: string[] = [`# Weekly Review — ${dateRange}`, '']

  // Stats
  const weekEvents = opts.events.filter(e => new Date(e.createdAt) > weekStart)
  const sessionStarts = weekEvents.filter(e => e.type === 'session_started').length
  const audits = weekEvents.filter(e => e.type === 'audit_completed').length
  const debriefs = weekEvents.filter(e => e.type === 'debrief_generated').length

  lines.push('## Summary')
  lines.push(`- **${sessionStarts}** sessions launched`)
  lines.push(`- **${audits}** audits completed`)
  lines.push(`- **${debriefs}** debriefs generated`)
  lines.push(`- **${opts.insights.length}** insights captured`)
  lines.push(`- **${opts.data.pipeline.ideas}** ideas · **${opts.data.pipeline.specs}** specs · **${opts.data.pipeline.plans}** plans in pipeline`)
  lines.push('')

  // Most active projects
  const projectActivity = new Map<string, number>()
  for (const e of weekEvents) {
    if (e.projectId) projectActivity.set(e.projectId, (projectActivity.get(e.projectId) ?? 0) + 1)
  }
  if (projectActivity.size > 0) {
    lines.push('## Most Active Projects')
    const sorted = Array.from(projectActivity).sort((a, b) => b[1] - a[1]).slice(0, 5)
    for (const [, count] of sorted) {
      const evt = weekEvents.find(e => e.projectId === sorted.find(s => s[1] === count)?.[0])
      lines.push(`- ${evt?.projectId ?? 'unknown'}: ${count} events`)
    }
    lines.push('')
  }

  // Key insights
  const weekInsights = opts.insights.filter(i => new Date(i.created_at) > weekStart)
  if (weekInsights.length > 0) {
    lines.push('## Key Insights')
    for (const insight of weekInsights.slice(0, 5)) {
      lines.push(`- **[${insight.category}]** ${insight.title}`)
    }
    lines.push('')
  }

  // Git activity
  const totalCommits = opts.gitActivity.reduce((sum, p) => sum + p.recentCommits.length, 0)
  const dirtyProjects = opts.gitActivity.filter(p => p.uncommittedChanges > 0)
  lines.push('## Git')
  lines.push(`- ${totalCommits} recent commits across ${opts.gitActivity.length} projects`)
  if (dirtyProjects.length > 0) {
    lines.push(`- ${dirtyProjects.length} project${dirtyProjects.length > 1 ? 's' : ''} with uncommitted changes: ${dirtyProjects.map(p => p.projectName).join(', ')}`)
  }
  lines.push('')

  // Recommendations
  lines.push('## Next Week')
  if (opts.data.health.blockers > 0) {
    lines.push(`- Fix ${opts.data.health.blockers} plan${opts.data.health.blockers > 1 ? 's' : ''} with audit blockers`)
  }
  const staleItems = opts.data.upNext.filter(i => i.stale)
  if (staleItems.length > 0) {
    lines.push(`- Address ${staleItems.length} stale feature${staleItems.length > 1 ? 's' : ''}`)
  }
  const readyToDevelop = opts.data.upNext.filter(i => i.stage === 'develop' && i.auditStatus === 'clean')
  if (readyToDevelop.length > 0) {
    lines.push(`- ${readyToDevelop.length} feature${readyToDevelop.length > 1 ? 's' : ''} ready to develop`)
  }

  return lines.join('\n')
}
