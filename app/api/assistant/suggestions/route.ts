// app/api/assistant/suggestions/route.ts
import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions } from '@/lib/db'
import { buildDashboardData } from '@/lib/dashboard'
import { generateSuggestions } from '@/lib/assistant'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const dashboardData = buildDashboardData(projects, activeSessions)
  const suggestions = generateSuggestions(dashboardData)
  return NextResponse.json({ suggestions })
}
