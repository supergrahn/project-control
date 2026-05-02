import { NextResponse, type NextRequest } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/projects/:id/critic-findings?ref=<relative-path>
//
// Returns the most recent critic_findings row for a (project, ref) pair.
// `ref` is the relative path to the spec/plan markdown file. Returns null
// (HTTP 200) when no findings have been computed yet — the UI treats that
// as "panel hidden" rather than an error so the docs page renders even
// before the critic ensemble has had a chance to run.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) {
    return NextResponse.json({ error: 'ref required' }, { status: 400 })
  }
  const db = getDb()
  const row = db
    .prepare(
      `SELECT findings, content_hash FROM critic_findings WHERE project_id = ? AND ref = ?`,
    )
    .get(projectId, ref) as { findings: string; content_hash: string } | undefined

  if (!row) return NextResponse.json(null)

  let findings: unknown
  try {
    findings = JSON.parse(row.findings)
  } catch {
    return NextResponse.json({ error: 'corrupted findings row' }, { status: 500 })
  }

  return NextResponse.json({ findings, content_hash: row.content_hash })
}
