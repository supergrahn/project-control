import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'

export type ConfigField = {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string
}

export type ExternalTask = {
  sourceId: string
  title: string
  description: string | null
  status: string
  priority: string | null
  url: string
  labels: string[]
  assignees: string[]
  meta: Record<string, unknown>
}

export type AvailableResource = {
  id: string
  name: string
}

export type TaskSourceAdapter = {
  key: string
  name: string
  configFields: ConfigField[]
  resourceSelectionLabel: string
  fetchAvailableResources(config: Record<string, string>): Promise<AvailableResource[]>
  fetchTasks(config: Record<string, string>, resourceIds: string[]): Promise<ExternalTask[]>
  mapStatus(raw: string): TaskStatus
  mapPriority(raw: string | null): TaskPriority
}
