'use client'

import type { ExternalTask, ExternalTaskStatus } from '@/lib/types/externalTask'
import { SOURCE_STYLES, SOURCE_LABELS } from '@/lib/externalTasks/taskStyles'

interface Column {
  status: ExternalTaskStatus
  label: string
  headerCls: string
}

const COLUMNS: Column[] = [
  { status: 'todo',       label: 'Todo',             headerCls: 'text-zinc-300 border-zinc-700' },
  { status: 'inprogress', label: 'In Progress',       headerCls: 'text-blue-300 border-blue-700/50' },
  { status: 'review',     label: 'Review / Testing',  headerCls: 'text-violet-300 border-violet-700/50' },
  { status: 'blocked',    label: 'Blocked',           headerCls: 'text-red-300 border-red-700/50' },
  { status: 'done',       label: 'Done',              headerCls: 'text-emerald-300 border-emerald-700/50' },
]

function KanbanTaskCard({ task, onSelect }: { task: ExternalTask; onSelect: (task: ExternalTask) => void }) {
  return (
    <div
      onClick={() => onSelect(task)}
      className="flex flex-col gap-1.5 rounded-lg border border-border-default bg-bg-secondary p-3 cursor-pointer hover:border-border-hover transition-colors"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${SOURCE_STYLES[task.source]}`}>
          {SOURCE_LABELS[task.source]}
        </span>
      </div>
      <p className="text-xs font-medium text-text-primary leading-snug line-clamp-2">{task.title}</p>
      {task.rawStatus && (
        <p className="text-[10px] text-text-secondary truncate">{task.rawStatus}</p>
      )}
      {task.assignees.length > 0 && (
        <p className="text-[10px] text-text-muted truncate">{task.assignees[0]}</p>
      )}
    </div>
  )
}

interface Props {
  tasks: ExternalTask[]
  onSelect: (task: ExternalTask) => void
}

export function ExternalKanbanBoard({ tasks, onSelect }: Props) {
  const tasksByStatus = new Map<ExternalTaskStatus, ExternalTask[]>()
  for (const col of COLUMNS) tasksByStatus.set(col.status, [])
  for (const t of tasks) tasksByStatus.get(t.status)?.push(t)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {COLUMNS.map((col) => {
        const colTasks = tasksByStatus.get(col.status) ?? []
        return (
          <div
            key={col.status}
            className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-primary p-3 min-h-[200px]"
          >
            <div className={`flex items-center gap-2 pb-2 mb-1 border-b ${col.headerCls}`}>
              <h2 className="text-xs font-semibold">{col.label}</h2>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-secondary">
                {colTasks.length}
              </span>
            </div>
            {colTasks.map((task) => (
              <KanbanTaskCard key={`${task.source}-${task.id}`} task={task} onSelect={onSelect} />
            ))}
            {colTasks.length === 0 && (
              <p className="text-[10px] text-text-faint italic text-center mt-4">No tasks</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
