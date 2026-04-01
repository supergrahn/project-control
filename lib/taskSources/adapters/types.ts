import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'

export type ConfigField = {
  key: string               // storage key in task_source_config table
  label: string             // display label in settings form
  type: 'text' | 'password' | 'textarea'
  placeholder?: string
  required: boolean
  helpText?: string         // optional hint shown below the field
}

export type ExternalTask = {
  sourceId: string          // unique ID in the external system
  title: string
  description: string | null
  status: string            // raw status string from source
  priority: string | null   // raw priority string from source
  url: string               // link back to the source
  labels: string[]
  assignees: string[]
  meta: Record<string, unknown>  // raw source data preserved as JSON
}

export type TaskSourceAdapter = {
  key: string               // 'jira' | 'github' | 'monday' | 'donedone'
  name: string              // 'Jira' | 'GitHub Issues' | 'Monday.com' | 'DoneDone'
  configFields: ConfigField[]
  fetchTasks(config: Record<string, string>): Promise<ExternalTask[]>
  mapStatus(raw: string): TaskStatus
  mapPriority(raw: string | null): TaskPriority
}
