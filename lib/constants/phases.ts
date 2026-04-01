import type { TaskStatus, TaskPriority } from '@/lib/db/tasks'

export const PHASE_COLORS: Record<TaskStatus, string> = {
  idea: 'accent-blue',
  speccing: 'accent-green',
  planning: 'accent-purple',
  developing: 'accent-orange',
  done: 'accent-red',
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-muted',
  medium: 'accent-blue',
  high: 'accent-orange',
  urgent: 'accent-red',
}

export const PHASE_LABELS: Record<TaskStatus, string> = {
  idea: 'Idea',
  speccing: 'Spec',
  planning: 'Plan',
  developing: 'Dev',
  done: 'Done',
}
