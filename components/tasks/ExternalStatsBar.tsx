'use client'

import type { ExternalTask, ExternalTaskStatus } from '@/lib/types/externalTask'

const STATUS_COLORS: Record<ExternalTaskStatus, string> = {
  todo: 'bg-zinc-500', inprogress: 'bg-blue-500', review: 'bg-purple-500',
  blocked: 'bg-red-500', done: 'bg-green-500',
}

const STATUS_LABELS: Record<ExternalTaskStatus, string> = {
  todo: 'Todo', inprogress: 'In Progress', review: 'Review',
  blocked: 'Blocked', done: 'Done',
}

interface Props {
  tasks: ExternalTask[]
  onStatusClick?: (status: ExternalTaskStatus) => void
}

export function ExternalStatsBar({ tasks, onStatusClick }: Props) {
  const counts: Record<ExternalTaskStatus, number> = {
    todo: 0, inprogress: 0, review: 0, blocked: 0, done: 0,
  }
  for (const t of tasks) counts[t.status]++

  return (
    <div className="flex items-center gap-3 mb-3 text-xs">
      <span className="text-zinc-400 font-medium">{tasks.length} tasks</span>
      <div className="flex items-center gap-2">
        {(Object.entries(counts) as [ExternalTaskStatus, number][])
          .filter(([, count]) => count > 0)
          .map(([status, count]) => (
            <button
              key={status}
              onClick={() => onStatusClick?.(status)}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 bg-transparent border-none cursor-pointer transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[status]}`} />
              <span>{count} {STATUS_LABELS[status]}</span>
            </button>
          ))
        }
      </div>
    </div>
  )
}
