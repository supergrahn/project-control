import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { createTask, getTasksByProject } from '@/lib/db/tasks'
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
  const body = await req.json()
  const { projectId, title } = body

  if (!projectId || !title?.trim()) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 })
  }

  const db = getDb()
  const task = createTask(db, { id: randomUUID(), projectId, title: title.trim() })
  return NextResponse.json(task, { status: 201 })
}
