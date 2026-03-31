'use client'
import { useState, useEffect, useRef } from 'react'
import type { Task, TaskStatus } from '@/lib/db/tasks'
import { PHASE_CONFIG, STATUS_ORDER } from '@/lib/taskPhaseConfig'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { stopSession } from '@/lib/sessionActions'

type DrawerSection = 'artifacts' | 'sessions' | 'notes'

type Props = {
  task: Task
  activeSessionId?: string | null
  onOpenDrawer: (section: DrawerSection) => void
}

const ARTIFACT_FIELDS: Record<TaskStatus, keyof Task | null> = {
  idea: 'idea_file', speccing: 'spec_file', planning: 'plan_file', developing: 'dev_summary', done: null
}

type LogLine = { time: string; text: string; color: string }

export function TaskDetailView({ task, activeSessionId, onOpenDrawer }: Props) {
  const currentIndex = STATUS_ORDER.indexOf(task.status)
  const [expandedPhase, setExpandedPhase] = useState<TaskStatus | null>(task.status === 'done' ? null : task.status)
  const [logLines, setLogLines] = useState<LogLine[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)
  const { openWindow } = useSessionWindows()

  async function handleStop() {
    if (!activeSessionId) return
    await stopSession(activeSessionId)
  }

  function handleOpenTerminal() {
    if (!activeSessionId) return
    openWindow({
      id: activeSessionId,
      project_id: task.project_id,
      label: task.title,
      phase: task.status,
      source_file: null,
      status: 'active',
      created_at: task.updated_at,
      ended_at: null,
    })
  }

  useEffect(() => {
    if (!activeSessionId) return
    const ws = new WebSocket(`ws://${window.location.host}/api/sessions/${activeSessionId}/ws`)
    ws.onmessage = (e) => {
      const text: string = typeof e.data === 'string' ? e.data : ''
      const match = text.match(/^(Write|Edit|Bash|Read|Glob|Grep)\s+·\s+(.+)$/m)
      if (!match) return
      const colorMap: Record<string, string> = { Write: '#8f77c9', Edit: '#8f77c9', Bash: '#5b9bd5', Read: '#5a6370', Glob: '#5a6370', Grep: '#5a6370' }
      const now = new Date()
      const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
      setLogLines(prev => [...prev, { time, text: `${match[1]} · ${match[2]}`, color: colorMap[match[1]] ?? '#8a9199' }])
    }
    return () => ws.close()
  }, [activeSessionId])

  useEffect(() => {
    if (typeof logEndRef.current?.scrollIntoView === 'function') {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logLines])

  return (
    <div style={{ padding: '24px 28px', fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>

      {/* Header */}
      <div style={{ color: '#454c54', fontSize: 11, marginBottom: 4 }}>
        {task.project_id} / {task.id}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ color: '#e2e6ea', fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 16 }}>
          {(['artifacts', 'sessions', 'notes'] as DrawerSection[]).map(s => (
            <button key={s} onClick={() => onOpenDrawer(s)} style={{ background: '#141618', color: '#5a6370', border: '1px solid #1c1f22', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', textTransform: 'capitalize' }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Phase bar */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 24 }}>
        {STATUS_ORDER.map((s, i) => {
          const cfg = PHASE_CONFIG[s]
          return (
            <div key={s} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i < currentIndex ? '#3a8c5c' : i === currentIndex ? cfg.color : '#1c1f22',
              opacity: task.status === 'done' ? 0.6 : 1,
            }} />
          )
        })}
      </div>

      {/* Phase timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STATUS_ORDER.map((phase, i) => {
          const cfg = PHASE_CONFIG[phase]
          const isActive = phase === task.status && task.status !== 'done'
          const isPending = i > currentIndex
          const isExpanded = expandedPhase === phase
          const artifactField = ARTIFACT_FIELDS[phase]
          const hasArtifact = artifactField && task[artifactField]

          if (isPending) {
            return (
              <div key={phase} style={{ border: '1px dashed #1c1f22', borderRadius: 8, opacity: 0.35 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed #2e3338', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ color: '#2e3338', fontWeight: 600, fontSize: 12 }}>{cfg.icon} {cfg.label}</span>
                </div>
              </div>
            )
          }

          return (
            <div key={phase} style={{ border: `1px solid ${isActive ? cfg.color + '44' : '#1c1f22'}`, borderRadius: 8, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedPhase(isExpanded ? null : phase)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: isActive ? cfg.bgColor : '#0e1012', cursor: 'pointer' }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: isActive ? cfg.bgColor : '#0c1a12',
                  border: `1.5px solid ${cfg.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, color: cfg.color, flexShrink: 0,
                }}>
                  {isActive ? <span style={{ width: 5, height: 5, background: cfg.color, borderRadius: '50%', display: 'inline-block' }} /> : '✓'}
                </span>
                <span style={{ color: isActive ? cfg.color : '#5a6370', fontWeight: 600, fontSize: 12 }}>{cfg.icon} {cfg.label}</span>
                <span style={{ color: isActive ? cfg.color + '55' : '#2e3338', fontSize: 10, marginLeft: 'auto' }}>
                  {isExpanded ? '∨' : '›'}
                </span>
              </div>

              {isExpanded && (
                <div style={{ padding: '10px 12px', background: '#0a0c0e', borderTop: `1px solid ${cfg.color}22` }}>
                  {isActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: 'monospace', fontSize: 11, marginBottom: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {logLines.length === 0 && (
                        <div style={{ color: '#454c54' }}>No actions yet</div>
                      )}
                      {logLines.map((line, idx) => (
                        <div key={idx} style={{
                          display: 'flex', gap: 8,
                          background: idx === logLines.length - 1 ? cfg.bgColor : 'transparent',
                          padding: idx === logLines.length - 1 ? '3px 6px' : '0',
                          borderRadius: 4,
                          borderLeft: idx === logLines.length - 1 ? `2px solid ${cfg.color}` : 'none',
                        }}>
                          <span style={{ color: '#2e3338', flexShrink: 0 }}>{line.time}</span>
                          <span style={{ color: line.color }}>{line.text}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                  {!isActive && hasArtifact && (
                    <div style={{ color: '#5a6370', fontSize: 11 }}>
                      Artifact: <span style={{ color: cfg.color }}>{String(task[artifactField as keyof Task]).split('/').pop()}</span>
                    </div>
                  )}
                  {isActive && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={handleOpenTerminal}
                        disabled={!activeSessionId}
                        style={{ flex: 1, background: cfg.bgColor, color: activeSessionId ? cfg.color : '#454c54', border: `1px solid ${cfg.color}33`, borderRadius: 6, padding: '5px 0', fontSize: 11, cursor: activeSessionId ? 'pointer' : 'default' }}
                      >
                        Open Terminal
                      </button>
                      <button
                        onClick={handleStop}
                        disabled={!activeSessionId}
                        style={{ background: '#1c1f22', color: activeSessionId ? '#c97e2a' : '#454c54', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: activeSessionId ? 'pointer' : 'default' }}
                      >
                        Stop
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
