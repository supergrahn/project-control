import { NextResponse } from 'next/server'
import { getDb, listProjects } from '@/lib/db'
import { getRecentEvents } from '@/lib/events'
import { buildTimeline } from '@/lib/timeline'

export async function GET() {
  const db = getDb()
  const events = getRecentEvents(db, 200)
  const projects = listProjects(db)
  const projectNames = new Map(projects.map(p => [p.id, p.name]))
  const timeline = buildTimeline(events, projectNames)
  return NextResponse.json({ timeline })
}
