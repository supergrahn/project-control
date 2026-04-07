'use client'

import { ExternalLink, CheckCircle2, Clock, AlertCircle, MinusCircle, Tag } from 'lucide-react'
import type { ExternalTask, ExternalTaskStatus } from '@/lib/types/externalTask'
import { getDueDateStatus, getStaleStatus } from '@/lib/externalTasks/dueDate'
import {
  SOURCE_STYLES, SOURCE_LABELS,
  STATUS_LABELS, STATUS_STYLES,
  PRIORITY_LABELS, PRIORITY_COLORS,
} from '@/lib/externalTasks/taskStyles'

function StatusIcon({ status }: { status: ExternalTaskStatus }) {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (status) {
    case 'done':       return <CheckCircle2 className={`${cls} text-emerald-400`} />
    case 'inprogress': return <Clock className={`${cls} text-blue-400`} />
    case 'blocked':    return <AlertCircle className={`${cls} text-red-400`} />
    default:           return <MinusCircle className={`${cls} text-zinc-500`} />
  }
}

interface Props {
  task: ExternalTask
  onSelect?: (task: ExternalTask) => void
}

export function ExternalTaskCard({ task, onSelect }: Props) {
  return (
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) return
        onSelect?.(task)
      }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect?.(task) } }}
      tabIndex={onSelect ? 0 : undefined}
      role={onSelect ? 'button' : undefined}
      className="group relative flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all duration-150 cursor-pointer"
    >
      {/* Top row: source + priority */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_STYLES[task.source]}`}>
          {SOURCE_LABELS[task.source]}
        </span>
        {task.priority && (
          <span className="flex items-center gap-1 ml-auto text-xs text-zinc-400">
            <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-zinc-100 leading-snug line-clamp-2">
        {task.title}
      </h3>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-zinc-500 truncate max-w-[140px]">{task.project}</span>
        <span className="text-zinc-700">·</span>
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[task.status]}`}>
          <StatusIcon status={task.status} />
          {STATUS_LABELS[task.status]}
        </span>
        {task.dueDate && (() => {
          const dueDateStatus = getDueDateStatus(task.dueDate)
          const dueDateCls =
            dueDateStatus === 'overdue'   ? 'text-red-400 font-medium' :
            dueDateStatus === 'due-today' ? 'text-amber-400 font-medium' :
                                            'text-zinc-400'
          let dueDateLabel: string
          if (dueDateStatus === 'overdue') {
            const now = new Date()
            const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
            const due = new Date(task.dueDate!)
            const dueStart = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()))
            const days = Math.floor((todayStart.getTime() - dueStart.getTime()) / 86_400_000)
            dueDateLabel = `${days} day${days !== 1 ? 's' : ''} overdue`
          } else if (dueDateStatus === 'due-today') {
            dueDateLabel = 'Due today'
          } else {
            dueDateLabel = task.dueDate!
          }
          return (
            <>
              <span className="text-zinc-700">·</span>
              <span className={dueDateCls}>{dueDateLabel}</span>
            </>
          )
        })()}
      </div>

      {/* Assignees */}
      {task.assignees.length > 0 && (
        <p className="text-xs text-zinc-500 truncate">{task.assignees.join(', ')}</p>
      )}

      {/* Stale */}
      {getStaleStatus(task.updatedAt) && (
        <p className="text-xs text-zinc-600">Stale</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800 flex-wrap">
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open
        </a>
        {task.labels.map((label) => (
          <span key={label} className="flex items-center gap-1 text-xs text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
            <Tag className="w-3 h-3" />
            {label}
          </span>
        ))}
      </div>
    </article>
  )
}
