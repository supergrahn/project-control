// server/orchestrator-watcher.ts
import type { Database } from 'better-sqlite3'
import { getProjectEmitter } from '../lib/session-manager'
import { getDb, getOrchestratorById, listOrchestrators } from '../lib/db'
import { recordOutcome } from '../lib/router'

const watched = new Set<string>()

export function watchProject(projectId: string, orchestratorId: string, projectPath: string): void {
  if (watched.has(projectId)) return
  watched.add(projectId)

  getProjectEmitter(projectPath).on(
    'session-ended',
    (payload: { session_id: string; source_file: string | null; exit_reason: string }) => {
      const db = getDb()
      const orch = getOrchestratorById(db, orchestratorId)
      if (!orch || orch.status !== 'active') return

      // Log the event — the orchestrator MCP tools will pick it up
      console.log(`[orchestrator-watcher] Session ended for project ${projectId}: ${JSON.stringify(payload)}`)
    }
  )
}

export function startOrchestratorWatcher(): void {
  const db = getDb()
  for (const orch of listOrchestrators(db)) {
    if (orch.status === 'active') {
      const project = db.prepare('SELECT path FROM projects WHERE id = ?').get(orch.project_id) as { path: string } | undefined
      if (project) watchProject(orch.project_id, orch.id, project.path)
    }
  }
}

// --- Router learning hooks ---
// These are exported as named functions for unit-testability and are called
// from the orchestrator tools layer (server/orchestrator-tools.ts) at the
// real phase-advance and decision-write sites. They look up the most recent
// routing decision for a session and forward a success/failure outcome to
// the router's score rollup.

function latestDecisionId(db: Database, sessionId: string): string | null {
  const row = db
    .prepare(`SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(sessionId) as { id: string } | undefined
  return row?.id ?? null
}

export function onPhaseAdvanced(db: Database, sessionId: string): void {
  const decisionId = latestDecisionId(db, sessionId)
  if (!decisionId) return
  recordOutcome(db, { decisionId, outcome: 'success' })
}

export function onOverrideDecision(db: Database, sessionId: string): void {
  const decisionId = latestDecisionId(db, sessionId)
  if (!decisionId) return
  recordOutcome(db, { decisionId, outcome: 'failure' })
}
