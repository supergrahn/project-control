import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import { getTask } from '@/lib/db/tasks'
import { spawnSession, type SpawnOptions } from '@/lib/session-manager'

const STATUS_TO_PHASE: Record<string, SpawnOptions['phase']> = {
  idea: 'brainstorm',
  spec: 'spec',
  plan: 'develop',
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const task = getTask(db, id)
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  const phase = STATUS_TO_PHASE[task.status]
  if (!phase) return NextResponse.json({ error: `task status '${task.status}' is not startable` }, { status: 400 })
  const project = getProject(db, task.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  const sourceFile = task.idea_file ?? task.spec_file ?? task.plan_file ?? null
  try {
    const newId = await spawnSession({
      projectId: task.project_id,
      projectPath: project.path,
      label: `Start: ${task.title}`.slice(0, 200),
      phase,
      sourceFile,
      taskId: task.id,
      agentId: undefined,
      userContext: '',
      permissionMode: 'default',
      correctionNote: undefined,
      outputPath: undefined,
    })
    return NextResponse.json({ sessionId: newId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('CONCURRENT_SESSION:')) {
      return NextResponse.json({ error: 'concurrent session for this file', existingId: msg.split(':')[1] }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
