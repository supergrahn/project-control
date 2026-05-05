import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const { projectId, aTaskId, bTaskId } = body as { projectId?: string; aTaskId?: string; bTaskId?: string }
  if (!projectId || !aTaskId || !bTaskId) {
    return NextResponse.json({ error: 'projectId, aTaskId, bTaskId required' }, { status: 400 })
  }
  if (aTaskId === bTaskId) {
    return NextResponse.json({ error: 'aTaskId and bTaskId must differ' }, { status: 400 })
  }
  const [a, b] = [aTaskId, bTaskId].sort()
  getDb().prepare(`INSERT OR IGNORE INTO dedup_dismissals (project_id, a_task_id, b_task_id, dismissed_at) VALUES (?, ?, ?, ?)`)
    .run(projectId, a, b, new Date().toISOString())
  return NextResponse.json({ ok: true })
}
