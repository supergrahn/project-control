'use client'
import { useEffect, useRef, useState } from 'react'
import type { Task } from '@/lib/db/tasks'
import type { TaskStatus } from '@/lib/types'
import { PHASE_CONFIG, STATUS_ORDER } from '@/lib/taskPhaseConfig'
import { deleteTask } from '@/hooks/useTasks'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#5a6370', medium: '#5b9bd5', high: '#c97e2a', urgent: '#c04040',
}

const NEXT_ACTION: Record<TaskStatus, string | null> = {
  idea:       'Start Spec',
  speccing:   'Start Plan',
  planning:   'Start Dev',
  developing: null,
  done:       'View History',
}

type Props = {
  task: Task
  activeSessionId?: string | null
  onOpen: (task: Task) => void
  onAction?: (task: Task, action: string) => void
}

export function TaskCard({ task, activeSessionId, onOpen, onAction }: Props) {
  const config = PHASE_CONFIG[task.status]
  const isLive = !!activeSessionId
  const [lastAction, setLastAction] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!activeSessionId) return
    const ws = new WebSocket(`ws://${window.location.host}/api/sessions/${activeSessionId}/ws`)
    wsRef.current = ws
    ws.onmessage = (e) => {
      const text: string = typeof e.data === 'string' ? e.data : ''
      const match = text.match(/^(Write|Edit|Bash|Read|Glob|Grep)\s+·\s+(.+)$/m)
      if (match) setLastAction(`${match[1]} · ${match[2]}`)
    }
    return () => { ws.close(); wsRef.current = null }
  }, [activeSessionId])

  const nextAction = NEXT_ACTION[task.status]
  const currentIndex = STATUS_ORDER.indexOf(task.status)
  const relativeDate = new Date(task.updated_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })

  return (
    <div
      onClick={() => onOpen(task)}
      className="bg-bg-primary rounded-[10px] p-[14px] cursor-pointer"
      style={{
        border: `1px solid ${isLive ? config.color + '44' : '#1c1f22'}`,
      }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-[10px]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[6px] flex items-center justify-center text-[14px]" style={{ background: config.bgColor }}>
            {config.icon}
          </div>
          <span className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.5px]">
            {config.label}
          </span>
          {isLive && (
            <span className="flex items-center gap-1 px-[7px] py-0.5 rounded-full" style={{ background: config.color + '22' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: config.color }} />
              <span className="text-[10px]" style={{ color: config.color }}>Live</span>
            </span>
          )}
        </div>
        <span className="text-text-faint text-[10px]">{relativeDate}</span>
      </div>

      {/* Title */}
      <div className="text-text-primary text-[13px] font-semibold mb-2 leading-[1.4]">
        {task.title.charAt(0).toUpperCase() + task.title.slice(1)}
      </div>

      {/* Priority chip */}
      <span className="text-[9px] font-semibold uppercase tracking-[0.5px] inline-block rounded-[3px] border px-1 py-0.5 mt-0.5"
        style={{
          color: PRIORITY_COLORS[task.priority ?? 'medium'] ?? '#5b9bd5',
          background: (PRIORITY_COLORS[task.priority ?? 'medium'] ?? '#5b9bd5') + '18',
          borderColor: (PRIORITY_COLORS[task.priority ?? 'medium'] ?? '#5b9bd5') + '33',
        }}>
        {task.priority ?? 'medium'}
      </span>

      {/* Last Action */}
      <div className="mb-3 rounded-r-[4px]" style={{
        background: config.bgColor,
        borderLeft: `2px solid ${config.color}`,
        padding: '6px 8px',
      }}>
        <div className="text-text-faint text-[10px] mb-0.5">LAST ACTION</div>
        <div className="text-[11px] font-mono" style={{ color: lastAction ? config.color : '#454c54' }}>
          {lastAction ?? 'No actions yet'}
        </div>
      </div>

      {/* Phase bar */}
      <div className="flex gap-0.5 mb-3">
        {STATUS_ORDER.map((s, i) => (
          <div key={s} className="flex-1 h-[3px] rounded-[2px]" style={{
            background: i <= currentIndex
              ? (i === currentIndex ? config.color : '#3a8c5c')
              : '#1c1f22',
            opacity: task.status === 'done' ? 0.6 : 1,
          }} />
        ))}
      </div>

      {/* Action button */}
      <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
        {nextAction && (
          <button
            onClick={() => onAction?.(task, nextAction)}
            className="flex-1 border rounded-[6px] px-0 py-1 text-[11px] cursor-pointer"
            style={{
              background: config.bgColor,
              color: config.color,
              borderColor: config.color + '33',
            }}
          >
            {nextAction}
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="bg-bg-secondary text-text-muted border-none rounded-[6px] px-2 py-1 text-[11px] cursor-pointer"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 mb-1 bg-border-default border border-text-disabled rounded-[6px] overflow-hidden z-10 min-w-[140px]">
              <button
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm(`Remove "${task.title}" from the system?`)) {
                    deleteTask(task.id, task.project_id)
                  }
                }}
                className="block w-full px-3 py-2 bg-none border-none text-accent-red text-[12px] text-left cursor-pointer"
              >
                Remove from system
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
