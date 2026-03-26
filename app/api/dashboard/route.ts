import { NextResponse } from 'next/server'
import { getDb, listProjects, getActiveSessions } from '@/lib/db'
import { buildDashboardData } from '@/lib/dashboard'

export async function GET() {
  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const data = buildDashboardData(projects, activeSessions)
  return NextResponse.json(data)
}
