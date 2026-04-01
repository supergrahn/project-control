import type { Database } from 'better-sqlite3'
import { getProvider, getActiveProviders } from '@/lib/db/providers'
import type { Provider } from '@/lib/db/providers'

export type ResolveProviderOpts = {
  projectId: string
  taskId?: string
  agentId?: string
}

export function resolveProvider(db: Database, opts: ResolveProviderOpts): Provider {
  // 1. Task-level override
  if (opts.taskId) {
    const task = db.prepare('SELECT provider_id FROM tasks WHERE id = ? AND project_id = ?')
      .get(opts.taskId, opts.projectId) as { provider_id: string | null } | undefined
    if (!task) throw new Error('TASK_NOT_FOUND')
    if (task.provider_id) {
      const p = getProvider(db, task.provider_id)
      if (p && p.is_active === 1) return p
    }
  }

  // 2. Agent-level override (agents table may not exist yet — guard with try/catch)
  if (opts.agentId) {
    try {
      const agent = db.prepare('SELECT provider_id FROM agents WHERE id = ?')
        .get(opts.agentId) as { provider_id: string | null } | undefined
      if (agent?.provider_id) {
        const p = getProvider(db, agent.provider_id)
        if (p && p.is_active === 1) return p
      }
    } catch (err: unknown) {
      if (
        !(err instanceof Error) ||
        !err.message.includes('no such table')
      ) {
        throw err
      }
      // agents table does not exist yet — skip
    }
  }

  // 3. Project-level override
  const project = db.prepare('SELECT provider_id FROM projects WHERE id = ?')
    .get(opts.projectId) as { provider_id: string | null } | undefined
  if (!project) throw new Error('PROJECT_NOT_FOUND')
  if (project.provider_id) {
    const p = getProvider(db, project.provider_id)
    if (p && p.is_active === 1) return p
  }

  // 4. First active provider by created_at
  const active = getActiveProviders(db)
  if (active.length > 0) return active[0]

  throw new Error('NO_PROVIDERS_CONFIGURED')
}
