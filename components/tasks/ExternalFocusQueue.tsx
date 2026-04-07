'use client'
import type { ExternalTask } from '@/lib/types/externalTask'
import { rankTasks } from '@/lib/externalTasks/taskScoring'

const priorityColor: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400', medium: 'text-yellow-400', low: 'text-zinc-400',
}

interface Props {
  tasks: ExternalTask[]
  onSelect: (task: ExternalTask) => void
}

export function ExternalFocusQueue({ tasks, onSelect }: Props) {
  const ranked = rankTasks(tasks)

  return (
    <div className="flex flex-col gap-1">
      {ranked.length === 0 && (
        <div className="text-zinc-600 text-xs text-center py-8">No actionable tasks</div>
      )}
      {ranked.map((task, idx) => (
        <button
          key={`${task.source}-${task.id}`}
          onClick={() => onSelect(task)}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 cursor-pointer text-left w-full transition-colors"
        >
          <span className="text-zinc-600 text-xs font-mono w-6 text-right flex-shrink-0">
            {idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {idx === 0 && (
                <span className="bg-green-900/50 text-green-400 text-[9px] px-1.5 py-0.5 rounded">
                  Suggested next
                </span>
              )}
              <span className="text-[10px] text-zinc-500">{task.source} · {task.id}</span>
            </div>
            <p className="text-xs text-zinc-200 mt-0.5 truncate">{task.title}</p>
          </div>
          <span className={`text-[10px] ${priorityColor[task.priority ?? ''] ?? 'text-zinc-600'}`}>
            {task.priority ?? '—'}
          </span>
          <span className="text-[10px] text-zinc-600 font-mono w-10 text-right">{task.score}</span>
        </button>
      ))}
    </div>
  )
}
