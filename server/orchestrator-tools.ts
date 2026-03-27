// server/orchestrator-tools.ts
import { randomUUID } from 'crypto'
import {
  getDb, getActiveSessions, getProject, listProjects,
  createDecision, createProposedAction, getOrchestratorByProject,
} from '../lib/db'
import type { DecisionSeverity, ProposedActionType } from '../lib/orchestrator-types'
import fs from 'fs'
import path from 'path'

export async function listSessionsByProject(projectId: string) {
  const db = getDb()
  return db.prepare(
    `SELECT id, project_id, label, phase, source_file, status, created_at, progress_steps
     FROM sessions WHERE project_id = ? ORDER BY created_at DESC`
  ).all(projectId)
}

export async function readArtifact(sourceFile: string): Promise<string> {
  try {
    const resolved = path.resolve(sourceFile)
    // Validate file is within a registered project
    const projects = listProjects(getDb())
    const isWithinProject = projects.some(p => resolved.startsWith(path.resolve(p.path) + path.sep))
    if (!isWithinProject) return `(access denied: file not within any registered project)`
    if (!fs.existsSync(resolved)) return `(file not found: ${sourceFile})`
    return fs.readFileSync(resolved, 'utf8')
  } catch {
    return `(error reading: ${sourceFile})`
  }
}

export async function readProgress(sessionId: string): Promise<{ steps: unknown[] }> {
  const db = getDb()
  const session = db.prepare('SELECT progress_steps FROM sessions WHERE id = ?').get(sessionId) as { progress_steps?: string | null } | undefined
  if (!session?.progress_steps) return { steps: [] }
  try { return { steps: JSON.parse(session.progress_steps) } } catch { return { steps: [] } }
}

export async function spawnNewSession(projectId: string, phase: string, sourceFile?: string): Promise<string> {
  const project = getProject(getDb(), projectId)
  if (!project) throw new Error(`Project ${projectId} not found`)
  const port = process.env.PORT ?? '3000'
  const res = await fetch(`http://localhost:${port}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, phase, sourceFile }),
  })
  if (!res.ok) throw new Error(`Failed to spawn session: ${await res.text()}`)
  return ((await res.json()) as { sessionId: string }).sessionId
}

export async function advancePhase(sessionId: string): Promise<void> {
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as { phase: string; project_id: string; source_file: string | null } | undefined
  if (!session) throw new Error(`Session ${sessionId} not found`)
  // In project-control, "advance" means the orchestrator decides what to do next
  // This is a placeholder — actual logic depends on the pipeline state
  console.log(`[orchestrator] advance_phase called for session ${sessionId} (phase: ${session.phase})`)
}

export async function pauseSession(sessionId: string, reason: string): Promise<void> {
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as { project_id: string; source_file: string | null } | undefined
  if (!session) return
  const orch = getOrchestratorByProject(db, session.project_id)
  await logDecision({
    orchestrator_id: orch?.id ?? 'system',
    project_id: session.project_id,
    source_file: session.source_file ?? null,
    summary: reason,
    severity: 'warn',
  })
}

export async function proposeActions(
  sessionId: string,
  actions: Array<{ label: string; action_type: string; payload?: string }>
): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  for (const a of actions) {
    createProposedAction(db, {
      id: randomUUID(),
      session_id: sessionId,
      label: a.label,
      action_type: a.action_type as ProposedActionType,
      payload: a.payload ?? null,
      created_at: now,
      dismissed: 0,
    })
  }
}

export async function logDecision(input: {
  orchestrator_id: string
  project_id: string
  source_file?: string | null
  summary: string
  detail?: string | null
  severity: DecisionSeverity
}): Promise<void> {
  createDecision(getDb(), {
    id: randomUUID(),
    orchestrator_id: input.orchestrator_id,
    project_id: input.project_id,
    source_file: input.source_file ?? null,
    summary: input.summary,
    detail: input.detail ?? null,
    severity: input.severity,
    created_at: new Date().toISOString(),
  })
}

export async function sendNotification(channel: string, message: string): Promise<void> {
  // Stub — full implementation wired to NotificationService in a future task
  console.log(`[notify] channel=${channel} msg=${message}`)
}
