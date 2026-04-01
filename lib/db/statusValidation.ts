import type { Database } from 'better-sqlite3'
import type { Task, TaskStatus } from './tasks'
import { getTask } from './tasks'
import { getTaskDependencies } from './taskDependencies'

export const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  'idea': ['speccing', 'done'],
  'speccing': ['planning', 'idea', 'done'],
  'planning': ['developing', 'speccing', 'done'],
  'developing': ['done', 'planning'],
  'done': ['developing']
}

export function isValidTransition(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  return VALID_TRANSITIONS[fromStatus].includes(toStatus)
}

export function isBackwardTransition(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
  const forward = ['idea', 'speccing', 'planning', 'developing', 'done']
  return forward.indexOf(toStatus) < forward.indexOf(fromStatus)
}

export function checkReadiness(db: Database, task: Task, newStatus: TaskStatus): string[] {
  const warnings: string[] = []

  if (newStatus === 'planning' && !task.spec_file) {
    warnings.push('Spec file not set. Moving to Planning anyway.')
  }
  if (newStatus === 'developing' && !task.plan_file) {
    warnings.push('Plan file not set. Moving to Developing anyway.')
  }

  // Check unfinished dependencies
  const blockedBy = getTaskDependencies(db, task.id, 'incoming')
  const unfinished = blockedBy.filter((dep) => {
    const depTask = getTask(db, dep.depends_on_id)
    return depTask && depTask.status !== 'done'
  })
  if (unfinished.length > 0) {
    warnings.push(
      `${unfinished.length} unfinished ${unfinished.length === 1 ? 'dependency' : 'dependencies'}. Proceeding anyway.`
    )
  }

  return warnings
}
