import type { ExternalTask, ExternalTaskStatus, ExternalTaskPriority } from '@/lib/types/externalTask'
import type { TaskSourceAdapter } from './adapters/types'
import type { TaskSourceConfig } from '@/lib/db/taskSourceConfig'

/**
 * Maps a raw adapter task (ExternalTask from adapters/types) to the display-layer
 * ExternalTask type (lib/types/externalTask). Extracted here so it can be reused
 * by both the project-scoped route and the cross-project aggregator.
 */
export function mapExtToTask(
  ext: {
    sourceId: string
    url: string
    title: string
    description: string | null
    status: string
    priority: string | null
    labels: string[]
    assignees: string[]
    meta: Record<string, unknown>
  },
  adapter: TaskSourceAdapter,
  cfg: Pick<TaskSourceConfig, 'adapter_key'>,
): ExternalTask {
  return {
    id: ext.sourceId,
    source: cfg.adapter_key as ExternalTask['source'],
    url: ext.url,
    title: ext.title,
    description: ext.description,
    // TODO: unify TaskStatus and ExternalTaskStatus enums to remove casts
    status: adapter.mapStatus(ext.status) as unknown as ExternalTaskStatus,
    rawStatus: ext.status,
    priority: ext.priority != null ? (adapter.mapPriority(ext.priority) as unknown as ExternalTaskPriority) : null,
    project: (ext.meta as any)?.fields?.project?.name          // Jira
      ?? (ext.meta as any)?.boardName                         // Monday (board name stored in meta)
      ?? (ext.meta as any)?.project?.name                     // DoneDone nested project object
      ?? (ext.meta as any)?.project_name                      // DoneDone flat
      ?? ((ext.meta as any)?.repository_url as string | undefined)?.split('/').slice(-2).join('/')  // GitHub
      ?? adapter.name,                                         // fallback
    labels: ext.labels,
    assignees: ext.assignees,
    dueDate: (ext.meta as any)?.fields?.duedate               // Jira
      ?? (ext.meta as any)?.due_date                          // DoneDone
      ?? (ext.meta as any)?.milestone?.due_on                 // GitHub milestone
      ?? (ext.meta as any)?.dueDate ?? null,
    createdAt: (ext.meta as any)?.fields?.created             // Jira
      ?? (ext.meta as any)?.created_at                        // DoneDone, GitHub, Monday
      ?? (ext.meta as any)?.createdAt ?? null,
    updatedAt: (ext.meta as any)?.fields?.updated             // Jira
      ?? (ext.meta as any)?.updated_at                        // DoneDone, GitHub, Monday
      ?? (ext.meta as any)?.updatedAt ?? null,
    meta: ext.meta as Record<string, unknown>,
  }
}
