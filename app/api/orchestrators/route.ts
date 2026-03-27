import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, listOrchestrators, getOrchestratorByProject, createOrchestrator, getProject } from '@/lib/db'
import { spawnOrchestratorSession } from '@/lib/session-manager'

export async function GET() {
  return NextResponse.json({ orchestrators: listOrchestrators(getDb()) })
}

export async function POST(req: Request) {
  const { projectId } = await req.json() as { projectId?: string }
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const db = getDb()
  const project = getProject(db, projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const existing = getOrchestratorByProject(db, projectId)
  if (existing) return NextResponse.json({ error: 'Orchestrator already active', orchestrator: existing }, { status: 409 })

  const id = randomUUID()
  const sessionId = spawnOrchestratorSession({ orchestratorId: id, projectId, projectPath: project.path })

  createOrchestrator(db, { id, project_id: projectId, session_id: sessionId, status: 'active', created_at: new Date().toISOString(), ended_at: null })

  try {
    const { watchProject } = await import('@/server/orchestrator-watcher')
    watchProject(projectId, id, project.path)
  } catch {}

  return NextResponse.json({ orchestrator: { id, project_id: projectId, session_id: sessionId, status: 'active' } }, { status: 201 })
}
