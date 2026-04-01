'use client'
import { useEffect, useRef, useState } from 'react'
import type { Task } from '@/lib/db/tasks'
import { patchTask } from '@/hooks/useTasks'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#5a6370',
  medium: '#5b9bd5',
  high: '#c97e2a',
  urgent: '#c04040',
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const sectionLabel: React.CSSProperties = {
  color: '#5a6370',
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: 1,
  marginBottom: 4,
  marginTop: 16,
}

export function PropertiesPanel({ task }: { task: Task }) {
  const [labels, setLabels] = useState<string[]>(() => {
    try {
      return task.labels ? JSON.parse(task.labels) : []
    } catch {
      return []
    }
  })
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const labelInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/agents?projectId=${task.project_id}`)
      .then(res => {
        if (!res.ok) return []
        return res.json()
      })
      .then(data => {
        if (Array.isArray(data)) setAgents(data)
      })
      .catch(() => {})
  }, [task.project_id])

  const handleStatusChange = async (value: string) => {
    try { await patchTask(task.id, { status: value as Task['status'] }) } catch { /* ignore */ }
  }

  const handlePriorityClick = async (p: string) => {
    try { await patchTask(task.id, { priority: p as Task['priority'] }) } catch { /* ignore */ }
  }

  const handleLabelKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const input = e.currentTarget
    const value = input.value.trim()
    if (!value) return
    const updated = [...labels, value]
    setLabels(updated)
    input.value = ''
    try {
      await patchTask(task.id, { labels: updated })
    } catch {
      setLabels(labels)
    }
  }

  const handleLabelRemove = async (index: number) => {
    const updated = labels.filter((_, i) => i !== index)
    setLabels(updated)
    try {
      await patchTask(task.id, { labels: updated })
    } catch {
      setLabels(labels)
    }
  }

  const handleAssigneeChange = async (value: string) => {
    try { await patchTask(task.id, { assignee_agent_id: value || null }) } catch { /* ignore */ }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div style={{
      width: 260,
      flexShrink: 0,
      borderLeft: '1px solid #1e2124',
      padding: '20px 16px',
      overflowY: 'auto' as const,
      fontFamily: 'system-ui, sans-serif',
      background: '#0d0e10',
    }}>
      {/* Status */}
      <div style={sectionLabel}>Status</div>
      <select
        value={task.status}
        onChange={e => handleStatusChange(e.target.value)}
        style={{
          width: '100%',
          background: '#1a1d20',
          color: '#e2e6ea',
          border: '1px solid #2e3338',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <option value="idea">idea</option>
        <option value="speccing">speccing</option>
        <option value="planning">planning</option>
        <option value="developing">developing</option>
        <option value="done">done</option>
      </select>

      {/* Priority */}
      <div style={sectionLabel}>Priority</div>
      <div style={{ display: 'flex', gap: 4 }}>
        {PRIORITIES.map(p => {
          const isActive = task.priority === p
          return (
            <button
              key={p}
              onClick={() => handlePriorityClick(p)}
              style={{
                flex: 1,
                background: isActive ? PRIORITY_COLORS[p] : '#1a1d20',
                color: isActive ? '#fff' : '#8a9199',
                border: 'none',
                borderRadius: 5,
                padding: '4px 0',
                fontSize: 10,
                cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              {p}
            </button>
          )
        })}
      </div>

      {/* Labels */}
      <div style={sectionLabel}>Labels</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {labels.map((label, i) => (
          <span
            key={i}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              background: '#1a1d20',
              color: '#8a9199',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
            }}
          >
            {label}
            <button
              aria-label="×"
              onClick={() => handleLabelRemove(i)}
              style={{
                background: 'none',
                border: 'none',
                color: '#5a6370',
                cursor: 'pointer',
                padding: 0,
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        ref={labelInputRef}
        placeholder="Add label…"
        onKeyDown={handleLabelKeyDown}
        style={{
          width: '100%',
          background: '#1a1d20',
          color: '#e2e6ea',
          border: '1px solid #2e3338',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 12,
          boxSizing: 'border-box',
        }}
      />

      {/* Assignee */}
      <div style={sectionLabel}>Assignee</div>
      <select
        value={task.assignee_agent_id ?? ''}
        onChange={e => handleAssigneeChange(e.target.value)}
        style={{
          width: '100%',
          background: '#1a1d20',
          color: '#e2e6ea',
          border: '1px solid #2e3338',
          borderRadius: 6,
          padding: '5px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        {agents.length === 0 ? (
          <option disabled value="">No agents configured yet</option>
        ) : (
          <>
            <option value="">Unassigned</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </>
        )}
      </select>

      {/* Dates */}
      <div style={sectionLabel}>Created</div>
      <div style={{ color: '#8a9199', fontSize: 12 }}>{formatDate(task.created_at)}</div>

      <div style={sectionLabel}>Updated</div>
      <div style={{ color: '#8a9199', fontSize: 12 }}>{formatDate(task.updated_at)}</div>
    </div>
  )
}
