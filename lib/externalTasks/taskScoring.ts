import type { ExternalTask } from '@/lib/types/externalTask'

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
}

function dueDateFactor(dueDate: string | null): number {
  if (!dueDate) return 1.5
  const daysUntil = (new Date(dueDate).getTime() - Date.now()) / 86_400_000
  if (daysUntil < 0)  return 5
  if (daysUntil < 1)  return 4
  if (daysUntil < 7)  return 3
  if (daysUntil < 14) return 2
  return 1
}

function stalenessFactor(updatedAt: string | null): number {
  if (!updatedAt) return 2
  const daysSince = (Date.now() - new Date(updatedAt).getTime()) / 86_400_000
  return Math.min(1 + daysSince / 14, 5)
}

export function scoreTask(task: ExternalTask): number {
  const pw = PRIORITY_WEIGHT[task.priority ?? ''] ?? 1.5
  const df = dueDateFactor(task.dueDate)
  const sf = stalenessFactor(task.updatedAt)
  return Math.round(pw * df * sf * 10) / 10
}

export function rankTasks(tasks: ExternalTask[]): (ExternalTask & { score: number })[] {
  return tasks
    .filter(t => t.status !== 'done')
    .map(t => ({ ...t, score: scoreTask(t) }))
    .sort((a, b) => b.score - a.score)
}
