import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTask } from '@/lib/db/tasks'
import { prepareTask } from '@/lib/prep/prepareTask'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const db = getDb()
  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  void prepareTask(db, id)
  return NextResponse.json({ ok: true }, { status: 202 })
}
