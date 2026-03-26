import { NextResponse } from 'next/server'
import { getDb, listProjects, createProject, getProjectByPath } from '@/lib/db'

export function GET() {
  const projects = listProjects(getDb())
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  const { name, path } = await req.json()
  if (!name || !path) return NextResponse.json({ error: 'name and path required' }, { status: 400 })
  const db = getDb()
  const existing = getProjectByPath(db, path)
  if (existing) return NextResponse.json(existing)
  const id = createProject(db, { name, path })
  return NextResponse.json({ id })
}
