import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb, getInFlightSessions, getAllSessions, getProject } from '@/lib/db'
import { getTask } from '@/lib/db/tasks'
import { spawnSession } from '@/lib/session-manager'
import { generateOutputPath } from '@/lib/prompts'

function stripFileUrl(value: string): string {
  return value.startsWith('file://') ? value.slice(7) : value
}

function resolveProjectPath(projectPath: string, value: string): string {
  return path.resolve(projectPath, stripFileUrl(value))
}

function isWithinProject(projectPath: string, candidate: string): boolean {
  const resolvedProjectPath = path.resolve(projectPath)
  const resolvedCandidate = path.resolve(candidate)
  return resolvedCandidate === resolvedProjectPath || resolvedCandidate.startsWith(resolvedProjectPath + path.sep)
}

export function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const projectId = url.searchParams.get('projectId') ?? undefined
  const taskId = url.searchParams.get('taskId')
  const db = getDb()
  const agentId = url.searchParams.get('agentId')
  if (agentId) {
    const sessions = db.prepare('SELECT * FROM sessions WHERE agent_id = ? ORDER BY created_at DESC').all(agentId)
    return NextResponse.json(sessions)
  }
  if (taskId) {
    const sessions = status === 'active'
      ? db.prepare('SELECT * FROM sessions WHERE task_id = ? AND status = ? ORDER BY created_at DESC').all(taskId, 'active')
      : db.prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC').all(taskId)
    return NextResponse.json(sessions)
  }
  if (status === 'all') return NextResponse.json(getAllSessions(db, projectId))
  // 'active' here includes sessions in `needs_route_retry` so the UI can show
  // the route-retry dialog without the row disappearing into history.
  return NextResponse.json(getInFlightSessions(db))
}

export async function POST(req: Request) {
  const body = await req.json()
  const {
    projectId,
    phase,
    sourceFile,
    userContext = '',
    permissionMode = 'default',
    correctionNote,
    taskId,
    outputPath,
    agentId,
  } = body

  if (!projectId || !phase) {
    return NextResponse.json({ error: 'projectId and phase required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const task = typeof taskId === 'string' ? getTask(getDb(), taskId) : undefined
  if (taskId !== undefined) {
    if (typeof taskId !== 'string') {
      return NextResponse.json({ error: 'taskId must be a string' }, { status: 400 })
    }
    if (!task || task.project_id !== projectId) {
      return NextResponse.json({ error: 'task not found for project' }, { status: 404 })
    }
  }

  let resolvedSourceFile: string | null = null
  if (sourceFile !== undefined && sourceFile !== null) {
    if (typeof sourceFile !== 'string') {
      return NextResponse.json({ error: 'sourceFile must be a string' }, { status: 400 })
    }
    resolvedSourceFile = resolveProjectPath(project.path, sourceFile)
    if (!isWithinProject(project.path, resolvedSourceFile)) {
      return NextResponse.json({ error: 'sourceFile must be within project path' }, { status: 400 })
    }
    if (!fs.existsSync(resolvedSourceFile)) {
      return NextResponse.json({ error: 'sourceFile not found' }, { status: 404 })
    }
  }

  let resolvedOutputPath: string | undefined
  if (outputPath !== undefined && outputPath !== null) {
    if (typeof outputPath !== 'string') {
      return NextResponse.json({ error: 'outputPath must be a string' }, { status: 400 })
    }
    resolvedOutputPath = resolveProjectPath(project.path, outputPath)
    if (!isWithinProject(project.path, resolvedOutputPath)) {
      return NextResponse.json({ error: 'outputPath must be within project path' }, { status: 400 })
    }
  } else if (task && phase === 'spec' && project.specs_dir) {
    resolvedOutputPath = generateOutputPath(path.resolve(project.path, project.specs_dir), task.title)
  } else if (task && phase === 'plan' && project.plans_dir) {
    resolvedOutputPath = generateOutputPath(path.resolve(project.path, project.plans_dir), task.title)
  }

  try {
    if (resolvedOutputPath) {
      fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true })
    }

    const label = task
      ? `${task.title} · ${phase}`
      : resolvedSourceFile
        ? `${path.basename(resolvedSourceFile, '.md')} · ${phase}`
        : phase

    const sessionId = await spawnSession({
      projectId,
      projectPath: project.path,
      label,
      phase,
      sourceFile: resolvedSourceFile,
      userContext,
      permissionMode,
      correctionNote: correctionNote ?? undefined,
      taskId: taskId ?? undefined,
      outputPath: resolvedOutputPath,
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
