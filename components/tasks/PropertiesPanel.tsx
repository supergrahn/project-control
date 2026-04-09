'use client'
import { useEffect, useRef, useState } from 'react'
import type { Task } from '@/lib/db/tasks'
import { patchTask } from '@/hooks/useTasks'
import { useMutation } from '@/hooks/useMutation'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#5a6370',
  medium: '#5b9bd5',
  high: '#c97e2a',
  urgent: '#c04040',
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

const sectionLabelClass = 'text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1 mt-4'

export function PropertiesPanel({ task }: { task: Task }) {
  const [labels, setLabels] = useState<string[]>(() => {
    try {
      return task.labels ? JSON.parse(task.labels) : []
    } catch {
      return []
    }
  })
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const mutate = useMutation()
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

  const handleStatusChange = (value: string) =>
    mutate(() => patchTask(task.id, { status: value as Task['status'] }), 'Failed to update status')

  const handlePriorityClick = (p: string) =>
    mutate(() => patchTask(task.id, { priority: p as Task['priority'] }), 'Failed to update priority')

  const handleLabelKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    const input = e.currentTarget
    const value = input.value.trim()
    if (!value) return
    const updated = [...labels, value]
    setLabels(updated)
    input.value = ''
    const result = await mutate(() => patchTask(task.id, { labels: updated }), 'Failed to add label')
    if (result === undefined) setLabels(labels)
  }

  const handleLabelRemove = async (index: number) => {
    const updated = labels.filter((_, i) => i !== index)
    setLabels(updated)
    const result = await mutate(() => patchTask(task.id, { labels: updated }), 'Failed to remove label')
    if (result === undefined) setLabels(labels)
  }

  const handleAssigneeChange = (value: string) =>
    mutate(() => patchTask(task.id, { assignee_agent_id: value || null }), 'Failed to update assignee')

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="w-64 flex-shrink-0 border-l border-border-subtle px-4 py-5 overflow-y-auto bg-bg-base">
      {/* Status */}
      <div className={sectionLabelClass}>Status</div>
      <select
        value={task.status}
        onChange={e => handleStatusChange(e.target.value)}
        className="w-full bg-bg-tertiary text-text-primary border border-text-disabled rounded-[6px] px-2 py-1 text-[12px] cursor-pointer"
      >
        <option value="idea">idea</option>
        <option value="speccing">speccing</option>
        <option value="planning">planning</option>
        <option value="developing">developing</option>
        <option value="done">done</option>
      </select>

      {/* Priority */}
      <div className={sectionLabelClass}>Priority</div>
      <div className="flex gap-1">
        {PRIORITIES.map(p => {
          const isActive = task.priority === p
          return (
            <button
              key={p}
              onClick={() => handlePriorityClick(p)}
              className="flex-1 rounded-[5px] px-0 py-1 text-[10px] cursor-pointer border-none"
              style={{
                background: isActive ? PRIORITY_COLORS[p] : '#1a1d20',
                color: isActive ? '#fff' : '#8a9199',
              }}
            >
              {p}
            </button>
          )
        })}
      </div>

      {/* Labels */}
      <div className={sectionLabelClass}>Labels</div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {labels.map((label, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-0.75 bg-bg-tertiary text-text-secondary rounded px-1.5 py-0.5 text-[11px]"
          >
            {label}
            <button
              aria-label="×"
              onClick={() => handleLabelRemove(i)}
              className="bg-none border-none text-text-muted cursor-pointer px-0 py-0 text-[12px] leading-none"
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
        className="w-full bg-bg-tertiary text-text-primary border border-text-disabled rounded-[6px] px-2 py-1 text-[12px] box-border"
      />

      {/* Assignee */}
      <div className={sectionLabelClass}>Assignee</div>
      <select
        value={task.assignee_agent_id ?? ''}
        onChange={e => handleAssigneeChange(e.target.value)}
        className="w-full bg-bg-tertiary text-text-primary border border-text-disabled rounded-[6px] px-2 py-1 text-[12px] cursor-pointer"
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
      <div className={sectionLabelClass}>Created</div>
      <div className="text-text-secondary text-[12px]">{formatDate(task.created_at)}</div>

      <div className={sectionLabelClass}>Updated</div>
      <div className="text-text-secondary text-[12px]">{formatDate(task.updated_at)}</div>
    </div>
  )
}
