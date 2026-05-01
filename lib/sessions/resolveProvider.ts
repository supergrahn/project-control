import type { Database } from 'better-sqlite3'
import { getProvider, getActiveProviders } from '@/lib/db/providers'
import type { Provider } from '@/lib/db/providers'
import type { SessionPhase } from '@/lib/db'

export type ResolveProviderOpts = {
  projectId: string
  taskId?: string
  agentId?: string
  phase: SessionPhase
  sessionId?: string  // required when the router branch fires; pins do not need it
}

export async function resolveProvider(db: Database, opts: ResolveProviderOpts): Promise<Provider> {
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

  // 4. Smart router runs when a sessionId is available; otherwise we still
  // fall back to first-active for callers that cannot persist a decision row.
  if (!opts.sessionId) {
    // No sessionId means the caller cannot persist a decision (e.g. an early
    // exploratory call with no session yet). Fall back to first-active.
    const active = getActiveProviders(db)
    if (active.length > 0) return active[0]
    throw new Error('NO_PROVIDERS_CONFIGURED')
  }
  // Dynamic import is defensive — there is no circular dep today, but
  // pickRoute calls into router internals that could grow a session-side
  // import in future. The cost amortizes to a Map lookup after first call.
  const { pickRoute } = await import('@/lib/router')
  const decision = await pickRoute(db, {
    projectId: opts.projectId,
    sessionId: opts.sessionId,
    taskId: opts.taskId,
    phase: opts.phase,
  })
  const picked = getProvider(db, decision.picked_provider)
  if (!picked) {
    // Distinct from NO_PROVIDERS_CONFIGURED: pickRoute selected from active
    // providers, but the row vanished or was deactivated between then and now.
    throw new Error('ROUTER_PICKED_UNKNOWN_PROVIDER')
  }
  return picked
}
