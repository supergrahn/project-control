import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTask } from '@/lib/db/tasks'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getDb()
  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  // Defensive: corrupt persisted JSON shouldn't 500 the inspection endpoint.
  // setTaskPrep is the only writer and uses JSON.stringify, so this branch
  // is only reachable via direct DB tampering — but better safe.
  let notes: unknown = null
  if (task.prep_notes) {
    try {
      notes = JSON.parse(task.prep_notes)
    } catch {
      notes = null
    }
  }
  return NextResponse.json({
    status: task.prep_status,
    notes,
    prepped_at: task.prepped_at,
  })
}
