import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { createTask, getTasksByProject, updateTask } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/db/tasks'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status') as TaskStatus | null

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  const db = getDb()
  const tasks = getTasksByProject(db, projectId, status ?? undefined)
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as unknown
  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as any).projectId !== 'string' ||
    !(body as any).projectId.trim() ||
    typeof (body as any).title !== 'string' ||
    !(body as any).title.trim()
  ) {
    return NextResponse.json({ error: 'projectId and title are required' }, { status: 400 })
  }
  const { projectId, title, notes, priority, labels, assignee_agent_id } = body as any

  const db = getDb()
  let task = createTask(db, {
    id: randomUUID(),
    projectId,
    title: title.trim(),
    priority: priority ?? undefined,
    labels: Array.isArray(labels) ? labels : undefined,
    assignee_agent_id: assignee_agent_id ?? undefined,
  })
  if (notes?.trim()) {
    task = updateTask(db, task.id, { notes: notes.trim() })
  }
  return NextResponse.json(task, { status: 201 })
}
