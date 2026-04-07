export type DueDateStatus = 'overdue' | 'due-today' | 'upcoming'

export function getDueDateStatus(dueDate: string | null | undefined): DueDateStatus | null {
  if (!dueDate) return null
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const due = new Date(dueDate)
  const dueStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()))
  const diffDays = Math.floor((dueStart.getTime() - todayStart.getTime()) / 86_400_000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due-today'
  return 'upcoming'
}

export function getStaleStatus(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false
  return Date.now() - new Date(updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000
}
