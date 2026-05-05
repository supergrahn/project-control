import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import type { Session } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'
import type { SpawnOptions } from '@/lib/session-manager'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const source = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined
  if (!source) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (!source.task_id && !source.source_file) {
    return NextResponse.json({ error: 'session has no originator (task_id or source_file)' }, { status: 400 })
  }
  // Orchestrator sessions are not normal user-driven sessions and cannot be
  // continued via spawnSession (whose Phase type does not include 'orchestrator').
  if (source.phase === 'orchestrator') {
    return NextResponse.json({ error: 'orchestrator sessions cannot be continued' }, { status: 400 })
  }
  const project = getProject(db, source.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  // Pre-empt task_id collision (spawnSession only natively guards source_file).
  if (source.task_id) {
    const activeForTask = db
      .prepare(`SELECT id FROM sessions WHERE task_id = ? AND status = 'active' LIMIT 1`)
      .get(source.task_id) as { id: string } | undefined
    if (activeForTask) {
      return NextResponse.json(
        { error: 'a session for this task is already active', existingId: activeForTask.id },
        { status: 409 },
      )
    }
  }

  const label = source.label?.startsWith('Continuation: ')
    ? source.label
    : `Continuation: ${source.label || 'session'}`

  try {
    const newId = await spawnSession({
      projectId: source.project_id,
      projectPath: project.path,
      label,
      phase: source.phase as SpawnOptions['phase'],
      sourceFile: source.source_file,
      taskId: source.task_id ?? undefined,
      agentId: source.agent_id ?? undefined,
      userContext: '',
      permissionMode: (source.permission_mode as SpawnOptions['permissionMode']) ?? 'default',
      correctionNote: undefined,
      outputPath: undefined,
    })
    return NextResponse.json({ sessionId: newId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('CONCURRENT_SESSION:')) {
      return NextResponse.json(
        { error: 'a session for this file is already active', existingId: message.split(':')[1] },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
