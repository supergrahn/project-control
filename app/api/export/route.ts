import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions, listInsights } from '@/lib/db'
import { getRecentEvents } from '@/lib/events'
import { buildDashboardData } from '@/lib/dashboard'
import { generateStandup } from '@/lib/standup'
import { generateWeeklyReview } from '@/lib/weekly-review'
import { scanGitActivity } from '@/lib/git-activity'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const data = buildDashboardData(projects, activeSessions)
  const events = getRecentEvents(db, 500)

  let content: string
  let filename: string

  switch (type) {
    case 'standup': {
      content = generateStandup({ data, events })
      filename = `standup-${new Date().toISOString().slice(0, 10)}.md`
      break
    }
    case 'weekly': {
      const insights = listInsights(db)
      const gitActivity = scanGitActivity(projects)
      content = generateWeeklyReview({ data, events, insights, gitActivity })
      filename = `weekly-review-${new Date().toISOString().slice(0, 10)}.md`
      break
    }
    case 'project-state': {
      const lines = [`# Project State — ${new Date().toISOString().slice(0, 10)}`, '']
      lines.push(`## Pipeline`)
      lines.push(`- ${data.pipeline.ideas} ideas · ${data.pipeline.specs} specs · ${data.pipeline.plans} plans · ${data.pipeline.active} active`)
      lines.push('')
      lines.push(`## Health`)
      lines.push(`- ${data.health.blockers} blockers · ${data.health.warnings} warnings · ${data.health.clean} clean · ${data.health.unaudited} unaudited`)
      lines.push('')
      if (data.upNext.length > 0) {
        lines.push(`## Up Next`)
        for (const item of data.upNext) {
          lines.push(`- **${item.featureName}** (${item.projectName}) — ${item.stage}${item.auditStatus ? ` [${item.auditStatus}]` : ''}`)
        }
        lines.push('')
      }
      if (data.inProgress.length > 0) {
        lines.push(`## In Progress`)
        for (const s of data.inProgress) {
          lines.push(`- **${s.featureName}** (${s.projectName}) — ${s.phase}`)
        }
      }
      content = lines.join('\n')
      filename = `project-state-${new Date().toISOString().slice(0, 10)}.md`
      break
    }
    default:
      return NextResponse.json({ error: 'type must be standup, weekly, or project-state' }, { status: 400 })
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
