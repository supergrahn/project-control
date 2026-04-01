import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { syncProject } from '@/lib/taskSources/syncService'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { id: projectId } = await params
  const db = getDb()
  const result = await syncProject(db, projectId)
  return NextResponse.json(result)
}
