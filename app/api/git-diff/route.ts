import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import { getGitDiff } from '@/lib/git-activity'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  const diff = getGitDiff(project.path)
  return NextResponse.json({ diff })
}
