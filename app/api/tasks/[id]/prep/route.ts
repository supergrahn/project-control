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

  return NextResponse.json({
    status: task.prep_status,
    notes: task.prep_notes ? JSON.parse(task.prep_notes) : null,
    prepped_at: task.prepped_at,
  })
}
