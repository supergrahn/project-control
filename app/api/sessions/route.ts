import { NextResponse } from 'next/server'
import path from 'path'
import { getDb, getActiveSessions, getAllSessions, getProject } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'

export function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const projectId = url.searchParams.get('projectId') ?? undefined
  const taskId = url.searchParams.get('taskId')
  const db = getDb()
  if (taskId) {
    const sessions = status === 'active'
      ? db.prepare('SELECT * FROM sessions WHERE task_id = ? AND status = ? ORDER BY created_at DESC').all(taskId, 'active')
      : db.prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC').all(taskId)
    return NextResponse.json(sessions)
  }
  if (status === 'all') return NextResponse.json(getAllSessions(db, projectId))
  return NextResponse.json(getActiveSessions(db))
}

export async function POST(req: Request) {
  const body = await req.json()
  const { projectId, phase, sourceFile, userContext = '', permissionMode = 'default', correctionNote, agentId } = body

  if (!projectId || !phase) {
    return NextResponse.json({ error: 'projectId and phase required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  if (sourceFile !== undefined && sourceFile !== null) {
    if (typeof sourceFile !== 'string') {
      return NextResponse.json({ error: 'sourceFile must be a string' }, { status: 400 })
    }
    const resolvedSourceFile = path.resolve(project.path, sourceFile)
    const resolvedProjectPath = path.resolve(project.path)
    if (!resolvedSourceFile.startsWith(resolvedProjectPath + path.sep)) {
      return NextResponse.json({ error: 'sourceFile must be within project path' }, { status: 400 })
    }
  }

  try {
    const label = sourceFile
      ? `${path.basename(sourceFile, '.md')} · ${phase}`
      : phase

    const sessionId = spawnSession({
      projectId,
      projectPath: project.path,
      label,
      phase,
      sourceFile: sourceFile ?? null,
      userContext,
      permissionMode,
      correctionNote: correctionNote ?? undefined,
      agentId: agentId ?? undefined,
    })

    return NextResponse.json({ sessionId })
  } catch (err: any) {
    if (err.message?.startsWith('CONCURRENT_SESSION:')) {
      const existingId = err.message.replace('CONCURRENT_SESSION:', '')
      return NextResponse.json({ error: 'concurrent_session', sessionId: existingId }, { status: 409 })
    }
    console.error('Session spawn error:', err)
    return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
  }
}
