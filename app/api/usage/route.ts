import { NextResponse } from 'next/server'
import { getDb, getAllSessions, listProjects } from '@/lib/db'
import { calculateUsage } from '@/lib/usage'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') === 'month' ? 30 : 7
  const db = getDb()
  const sessions = getAllSessions(db)
  const projects = new Map(listProjects(db).map(p => [p.id, p.name]))
  return NextResponse.json(calculateUsage(sessions, projects, period))
}
