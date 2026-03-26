import { NextResponse } from 'next/server'
import path from 'path'
import { getDb, getActiveSessions, getProject } from '@/lib/db'
import { spawnSession } from '@/lib/session-manager'

export function GET() {
  return NextResponse.json(getActiveSessions(getDb()))
}

export async function POST(req: Request) {
  const body = await req.json()
  const { projectId, phase, sourceFile, userContext = '', permissionMode = 'default' } = body

  if (!projectId || !phase) {
    return NextResponse.json({ error: 'projectId and phase required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

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
    })

    return NextResponse.json({ sessionId })
  } catch (err: any) {
    if (err.message?.startsWith('CONCURRENT_SESSION:')) {
      const existingId = err.message.split(':')[1]
      return NextResponse.json({ error: 'concurrent_session', sessionId: existingId }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
