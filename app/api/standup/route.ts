import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions } from '@/lib/db'
import { getRecentEvents } from '@/lib/events'
import { buildDashboardData } from '@/lib/dashboard'
import { generateStandup } from '@/lib/standup'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const data = buildDashboardData(projects, activeSessions)
  const events = getRecentEvents(db, 50)
  const standup = generateStandup({ data, events })
  return NextResponse.json({ standup })
}
