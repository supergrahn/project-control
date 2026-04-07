import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { syncProject, syncProjectSource } from '@/lib/taskSources/syncService'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params

  // Body is optional — a missing or non-JSON body means "sync all adapters"
  let body: { adapterKey?: string } = {}
  try { body = await req.json() } catch {}

  const db = getDb()

  if (body.adapterKey) {
    const result = await syncProjectSource(db, projectId, body.adapterKey)
    return NextResponse.json(result)
  }

  const results = await syncProject(db, projectId)
  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      deleted: acc.deleted + r.deleted,
    }),
    { created: 0, updated: 0, deleted: 0 }
  )
  return NextResponse.json(totals)
}
