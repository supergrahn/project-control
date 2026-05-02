import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import type { Session } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const file = req.nextUrl.searchParams.get('file')
  if (!file) {
    return NextResponse.json({ error: 'file query param required' }, { status: 400 })
  }
  const db = getDb()
  const project = db
    .prepare('SELECT id, path FROM projects WHERE id = ?')
    .get(projectId) as { id: string; path: string } | undefined
  if (!project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  // source_file is stored absolute. Convert the relative ?file= input to absolute for the match.
  const prefix = project.path.endsWith('/') ? project.path : project.path + '/'
  const absoluteFile = prefix + file.replace(/^\/+/, '')
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE project_id = ? AND source_file = ?
       ORDER BY created_at DESC`,
    )
    .all(projectId, absoluteFile) as Session[]
  return NextResponse.json(rows)
}
