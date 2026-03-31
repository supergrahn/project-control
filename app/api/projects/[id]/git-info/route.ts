import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import { getDb } from '@/lib/db'

function getGitBranch(projectPath: string): string {
  try {
    return execFileSync('git', ['-C', projectPath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim()
  } catch { return 'unknown' }
}

function getLastCommitTime(projectPath: string): string {
  try {
    return execFileSync('git', ['-C', projectPath, 'log', '-1', '--format=%cr'], { encoding: 'utf8', timeout: 5000 }).trim()
  } catch { return 'unknown' }
}

function getUncommittedCount(projectPath: string): number {
  try {
    const out = execFileSync('git', ['-C', projectPath, 'status', '--short'], { encoding: 'utf8', timeout: 5000 }).trim()
    return out ? out.split('\n').length : 0
  } catch { return 0 }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const db = getDb()
  const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(projectId) as { path: string } | undefined
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    branch: getGitBranch(project.path),
    lastCommit: getLastCommitTime(project.path),
    uncommitted: getUncommittedCount(project.path),
  })
}
