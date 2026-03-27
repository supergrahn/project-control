// server/orchestrator-watcher.ts
import { getProjectEmitter } from '../lib/session-manager'
import { getDb, getOrchestratorById, listOrchestrators } from '../lib/db'

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
