import type { ExternalTaskStatus, ExternalTaskPriority, ExternalTaskSource } from '@/lib/types/externalTask'

export const SOURCE_STYLES: Record<ExternalTaskSource, string> = {
  jira:     'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30',
  monday:   'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30',
  donedone: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  github:   'bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30',
}

export const SOURCE_LABELS: Record<ExternalTaskSource, string> = {
  jira: 'Jira', monday: 'Monday', donedone: 'DoneDone', github: 'GitHub',
}

export const STATUS_LABELS: Record<ExternalTaskStatus, string> = {
  todo: 'To Do', inprogress: 'In Progress', review: 'Review / Testing', done: 'Done', blocked: 'Blocked',
}

export const STATUS_STYLES: Record<ExternalTaskStatus, string> = {
  todo:       'bg-zinc-700/60 text-zinc-300',
  inprogress: 'bg-blue-600/20 text-blue-200',
  review:     'bg-violet-600/20 text-violet-200',
  done:       'bg-emerald-600/20 text-emerald-200',
  blocked:    'bg-red-600/20 text-red-200',
}

export const PRIORITY_LABELS: Record<ExternalTaskPriority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
}

export const PRIORITY_COLORS: Record<ExternalTaskPriority, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-zinc-500',
}

export function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
