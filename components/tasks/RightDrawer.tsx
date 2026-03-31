'use client'
import { useEffect, useRef } from 'react'
import type { Task } from '@/lib/db/tasks'

export type DrawerSection = 'artifacts' | 'sessions' | 'notes'

type Session = {
  id: string
  phase: string
  status: string
  created_at: string
  ended_at: string | null
}

type Props = {
  task: Task
  section: DrawerSection | null
  sessions: Session[]
  onClose: () => void
  onNotesChange: (notes: string) => void
}

export function RightDrawer({ task, section, sessions, onClose, onNotesChange }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!section) return
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [section, onClose])

  if (!section) return null

  return (
    <div
      ref={drawerRef}
      style={{
        width: 210,
        background: '#0c0e10',
        borderLeft: '1px solid #1c1f22',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1c1f22', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#e2e6ea', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{section}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#454c54', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
      </div>

      {section === 'artifacts' && <ArtifactsSection task={task} />}
      {section === 'sessions' && <SessionsSection sessions={sessions} />}
      {section === 'notes' && <NotesSection task={task} onNotesChange={onNotesChange} />}
    </div>
  )
}

function ArtifactsSection({ task }: { task: Task }) {
  const artifacts = [
    { label: 'Idea', file: task.idea_file, icon: '💡', color: '#5b9bd5' },
    { label: 'Spec', file: task.spec_file, icon: '📐', color: '#3a8c5c' },
    { label: 'Plan', file: task.plan_file, icon: '📋', color: '#8f77c9' },
    { label: 'Dev Summary', file: task.dev_summary, icon: '📝', color: '#c97e2a' },
  ]
  const docRefs: string[] = task.doc_refs ? JSON.parse(task.doc_refs) : []

  return (
    <div style={{ padding: '10px 14px' }}>
      <SectionLabel>Phase Files</SectionLabel>
      {artifacts.map(a => (
        <div key={a.label} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 7px',
          background: a.file ? '#0c1a12' : '#141618',
          borderRadius: 6,
          marginBottom: 5,
          cursor: a.file ? 'pointer' : 'default',
          opacity: a.file ? 1 : 0.4,
        }}>
          <span style={{ fontSize: 10 }}>{a.icon}</span>
          <span style={{ color: a.file ? a.color : '#454c54', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.file ? a.file.split('/').pop() : a.label}
          </span>
          {a.file && <span style={{ color: a.color, fontSize: 10, opacity: 0.6 }}>↗</span>}
        </div>
      ))}

      {docRefs.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 10 }}>Docs</SectionLabel>
          {docRefs.map((ref, i) => (
            <div key={i} style={{ padding: '5px 7px', background: '#141618', borderRadius: 6, marginBottom: 4 }}>
              <span style={{ color: '#5a6370', fontSize: 11 }}>{ref.split('/').pop()}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function SessionsSection({ sessions }: { sessions: Session[] }) {
  return (
    <div style={{ padding: '10px 14px' }}>
      <SectionLabel>{sessions.length} session{sessions.length !== 1 ? 's' : ''}</SectionLabel>
      {sessions.map(s => {
        const isLive = s.status === 'active'
        const phaseColors: Record<string, string> = { brainstorm: '#5b9bd5', spec: '#3a8c5c', plan: '#8f77c9', develop: '#c97e2a' }
        const color = phaseColors[s.phase] ?? '#5a6370'
        return (
          <div key={s.id} style={{ padding: '6px 8px', background: isLive ? '#160f04' : '#141618', border: `1px solid ${isLive ? '#c97e2a22' : 'transparent'}`, borderRadius: 6, marginBottom: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color, fontSize: 11, fontWeight: 600 }}>{s.phase}</span>
              {isLive
                ? <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 4, height: 4, background: '#c97e2a', borderRadius: '50%', display: 'inline-block' }} /><span style={{ color: '#c97e2a', fontSize: 10 }}>live</span></span>
                : <span style={{ color: '#2e3338', fontSize: 10 }}>✓</span>
              }
            </div>
            <div style={{ color: '#2e3338', fontSize: 10 }}>
              {new Date(s.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NotesSection({ task, onNotesChange }: { task: Task; onNotesChange: (v: string) => void }) {
  return (
    <div style={{ padding: '10px 14px' }}>
      <SectionLabel>Correction Notes</SectionLabel>
      <div style={{ color: '#5a6370', fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
        Notes are injected into the next session prompt for this task.
      </div>
      <textarea
        defaultValue={task.notes ?? ''}
        onBlur={e => onNotesChange(e.target.value)}
        placeholder="Add a note…"
        style={{
          width: '100%', minHeight: 120, background: '#141618', border: '1px solid #1c1f22',
          borderRadius: 6, padding: '7px 9px', color: '#8a9199', fontSize: 11,
          resize: 'vertical', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ color: '#2e3338', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, ...style }}>{children}</div>
}
