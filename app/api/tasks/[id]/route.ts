import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getTask, updateTask, advanceTaskStatus, deleteTask } from '@/lib/db/tasks'
import type { TaskStatus, UpdateTaskInput } from '@/lib/db/tasks'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const db = getDb()

  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Status advance is handled separately to enforce forward-only rule
  if (body.status) {
    const advanced = advanceTaskStatus(db, id, body.status as TaskStatus)
    return NextResponse.json(advanced)
  }

  const allowed: (keyof UpdateTaskInput)[] = [
    'idea_file', 'spec_file', 'plan_file', 'dev_summary',
    'commit_refs', 'doc_refs', 'notes'
  ]
  const input: UpdateTaskInput = {}
  for (const key of allowed) {
    if (key in body) (input as Record<string, unknown>)[key] = body[key]
  }

  const updated = updateTask(db, id, input)
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  deleteTask(db, id)
  return NextResponse.json({ ok: true })
}
