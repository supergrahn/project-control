import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions, listInsights } from '@/lib/db'
import { getRecentEvents } from '@/lib/events'
import { buildDashboardData } from '@/lib/dashboard'
import { scanGitActivity } from '@/lib/git-activity'
import { generateWeeklyReview } from '@/lib/weekly-review'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const data = buildDashboardData(projects, activeSessions)
  const events = getRecentEvents(db, 500)
  const insights = listInsights(db)
  const gitActivity = scanGitActivity(projects)
  const review = generateWeeklyReview({ data, events, insights, gitActivity })
  return NextResponse.json({ review })
}
