import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()

  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const rows = db.prepare(`
      SELECT
        tc.id,
        tc.source,
        tc.task_source_id,
        tc.author,
        tc.body,
        tc.created_at,
        t.title    AS task_title,
        t.source_url
      FROM task_comments tc
      LEFT JOIN tasks t
        ON t.project_id = tc.project_id
        AND t.source    = tc.source
        AND t.source_id = tc.task_source_id
      WHERE tc.project_id = ?
      ORDER BY tc.created_at DESC
      LIMIT 200
    `).all(projectId) as {
      id: string
      source: string
      task_source_id: string
      author: string
      body: string
      created_at: string
      task_title: string | null
      source_url: string | null
    }[]

    return NextResponse.json({ comments: rows })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
