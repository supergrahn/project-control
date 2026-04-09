// External task types (synced from third-party sources)
export type { ExternalTaskSource, ExternalTaskStatus, ExternalTaskPriority, ExternalTask } from './externalTask'

/**
 * Status values for internal project tasks (ideas, specs, plans, dev work).
 * Distinct from `ExternalTaskStatus` (used for tasks synced from external sources).
 *
 * Mapping chain: raw adapter string → adapter.mapStatus() → ExternalTaskStatus → UI label
 * Internal status transitions: idea → speccing → planning → developing → done
 */
export type TaskStatus = 'idea' | 'speccing' | 'planning' | 'developing' | 'done'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
