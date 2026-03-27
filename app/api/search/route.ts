import { NextResponse } from 'next/server'
import { getDb, listProjects } from '@/lib/db'
import { searchContent, rebuildSearchIndex } from '@/lib/search'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')
  const projectId = searchParams.get('projectId') ?? undefined
  const reindex = searchParams.get('reindex')

  const db = getDb()

  if (reindex === 'true') {
    const count = rebuildSearchIndex(db, listProjects(db))
    return NextResponse.json({ reindexed: true, count })
  }

  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 })
  return NextResponse.json({ results: searchContent(db, q, projectId) })
}
