import { NextResponse } from 'next/server'
import { getDb, listProjects } from '@/lib/db'
import { scanGitActivity } from '@/lib/git-activity'

export async function GET() {
  const projects = listProjects(getDb())
  return NextResponse.json({ projects: scanGitActivity(projects) })
}
