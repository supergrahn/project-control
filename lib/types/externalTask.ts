export type ExternalTaskSource = 'jira' | 'monday' | 'donedone' | 'github'
/**
 * Status values for external (synced) tasks as displayed in the UI.
 * Mapped from raw adapter strings via each adapter's `mapStatus()` function.
 * Distinct from `TaskStatus` (used for internal project tasks).
 *
 * Mapping chain: raw adapter string → adapter.mapStatus() → ExternalTaskStatus → UI label
 */
export type ExternalTaskStatus = 'todo' | 'inprogress' | 'review' | 'blocked' | 'done'
export type ExternalTaskPriority = 'critical' | 'high' | 'medium' | 'low'

export type ExternalTask = {
  id: string
  source: ExternalTaskSource
  url: string
  title: string
  description: string | null
  status: ExternalTaskStatus
  rawStatus?: string
  priority: ExternalTaskPriority | null
  project: string
  labels: string[]
  assignees: string[]
  dueDate: string | null
  createdAt: string | null
  updatedAt: string | null
  meta: Record<string, unknown>
}
