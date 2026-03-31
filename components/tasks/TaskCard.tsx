'use client'
import { useEffect, useRef, useState } from 'react'
import type { Task, TaskStatus } from '@/lib/db/tasks'
import { PHASE_CONFIG, STATUS_ORDER } from '@/lib/taskPhaseConfig'
import { deleteTask } from '@/hooks/useTasks'

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
      style={{
        background: '#0e1012',
        border: `1px solid ${isLive ? config.color + '44' : '#1c1f22'}`,
        borderRadius: 10,
        padding: 14,
        cursor: 'pointer',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: config.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
            {config.icon}
          </div>
          <span style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {config.label}
          </span>
          {isLive && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: config.color + '22', padding: '2px 7px', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: config.color, display: 'inline-block' }} />
              <span style={{ color: config.color, fontSize: 10 }}>Live</span>
            </span>
          )}
        </div>
        <span style={{ color: '#454c54', fontSize: 10 }}>{relativeDate}</span>
      </div>

      {/* Title */}
      <div style={{ color: '#e2e6ea', fontSize: 13, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
        {task.title.charAt(0).toUpperCase() + task.title.slice(1)}
      </div>

      {/* Last Action */}
      <div style={{
        background: config.bgColor,
        borderLeft: `2px solid ${config.color}`,
        padding: '6px 8px',
        borderRadius: '0 4px 4px 0',
        marginBottom: 12,
        fontFamily: 'monospace',
      }}>
        <div style={{ color: '#454c54', fontSize: 10, marginBottom: 3 }}>LAST ACTION</div>
        <div style={{ color: lastAction ? config.color : '#454c54', fontSize: 11 }}>
          {lastAction ?? 'No actions yet'}
        </div>
      </div>

      {/* Phase bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 12 }}>
        {STATUS_ORDER.map((s, i) => (
          <div key={s} style={{
            height: 3,
            flex: 1,
            borderRadius: 2,
            background: i <= currentIndex
              ? (i === currentIndex ? config.color : '#3a8c5c')
              : '#1c1f22',
            opacity: task.status === 'done' ? 0.6 : 1,
          }} />
        ))}
      </div>

      {/* Action button */}
      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
        {nextAction && (
          <button
            onClick={() => onAction?.(task, nextAction)}
            style={{
              flex: 1,
              background: config.bgColor,
              color: config.color,
              border: `1px solid ${config.color}33`,
              borderRadius: 6,
              padding: '5px 0',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {nextAction}
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{ background: '#141618', color: '#5a6370', border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 11, cursor: 'pointer' }}
          >
            ···
          </button>
          {menuOpen && (
            <div style={{
              position: 'absolute', bottom: '100%', right: 0, marginBottom: 4,
              background: '#1c1f22', border: '1px solid #2e3338', borderRadius: 6,
              overflow: 'hidden', zIndex: 10, minWidth: 140,
            }}>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  if (window.confirm(`Remove "${task.title}" from the system?`)) {
                    deleteTask(task.id, task.project_id)
                  }
                }}
                style={{
                  display: 'block', width: '100%', padding: '8px 12px', background: 'none',
                  border: 'none', color: '#c04040', fontSize: 12, textAlign: 'left', cursor: 'pointer',
                }}
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
