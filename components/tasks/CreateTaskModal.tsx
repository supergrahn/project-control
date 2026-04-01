'use client'
import { useState, useRef, useEffect } from 'react'
import { createTask } from '@/hooks/useTasks'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#5a6370', medium: '#5b9bd5', high: '#c97e2a', urgent: '#c04040',
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

type Props = {
  projectId: string
  onCreated: () => void
  onClose: () => void
  onNavigate: (taskId: string) => void
}

export function CreateTaskModal({ projectId, onCreated, onClose, onNavigate }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [labels, setLabels] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [assigneeAgentId, setAssigneeAgentId] = useState<string | null>(null)
  const [hasProviders, setHasProviders] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  // Autofocus title on mount
  useEffect(() => { titleRef.current?.focus() }, [])

  // Check providers on mount
  useEffect(() => {
    fetch('/api/providers')
      .then(res => {
        if (!res.ok) throw new Error('failed')
        return res.json()
      })
      .then(data => {
        setHasProviders(!data || data.length === 0 ? false : true)
      })
      .catch(() => setHasProviders(false))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (!loading && title.trim()) {
          handleSave()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, title, onClose])

  async function handleSave() {
    if (!title.trim() || loading) return
    setLoading(true)
    try {
      await createTask(projectId, title.trim(), description.trim() || undefined, {
        priority, labels: labels.length ? labels : undefined,
        assignee_agent_id: assigneeAgentId,
      })
      onCreated()
      onClose()
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  async function handleStartNow() {
    if (!title.trim() || loading || hasProviders === false) return
    setLoading(true)
    try {
      const task = await createTask(projectId, title.trim(), description.trim() || undefined, {
        priority, labels: labels.length ? labels : undefined,
        assignee_agent_id: assigneeAgentId,
      })
      const r = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, phase: 'brainstorm', taskId: task.id }),
      })
      if (!r.ok) {
        const err = await r.json()
        if (err.code !== 'concurrent_session') console.error(err)
      }
      onNavigate(task.id)
      onClose()
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  function handleLabelKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const value = labelInput.trim()
    if (!value) return
    setLabels(prev => [...prev, value])
    setLabelInput('')
  }

  function handleLabelRemove(index: number) {
    setLabels(prev => prev.filter((_, i) => i !== index))
  }

  const startNowButton = (
    <button
      role="button"
      aria-label="Start now"
      onClick={handleStartNow}
      disabled={hasProviders === false || loading || !title.trim()}
      className="rounded-[6px] px-3.5 py-1.5 text-[12px] border"
      style={{
        background: '#0d1a2d',
        color: hasProviders !== false ? '#5b9bd5' : '#3a4550',
        borderColor: '#5b9bd533',
        cursor: hasProviders !== false && title.trim() && !loading ? 'pointer' : 'not-allowed',
        opacity: hasProviders === false || !title.trim() || loading ? 0.5 : 1,
      }}
    >
      {loading ? 'Starting…' : 'Start now'}
    </button>
  )

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-[0.53] flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border-default rounded-[10px] px-7 py-7 w-[560px] max-w-[90vw]"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-text-primary text-[15px] font-bold mb-4">
          New Task
        </div>

        {/* Title */}
        <input
          ref={titleRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              descriptionRef.current?.focus()
            }
          }}
          placeholder="Task title"
          className="w-full bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-2 text-text-primary text-[13px] mb-2.5 box-border"
        />

        {/* Description */}
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="w-full bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-2 text-text-secondary text-[12px] min-h-20 resize-vertical mb-4 box-border"
        />

        {/* Priority */}
        <div className="text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1">
          Priority
        </div>
        <div className="flex gap-1 mb-4">
          {PRIORITIES.map(p => {
            const isActive = priority === p
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
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
        <div className="text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1">
          Labels
        </div>
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
          value={labelInput}
          onChange={e => setLabelInput(e.target.value)}
          onKeyDown={handleLabelKeyDown}
          placeholder="Add label…"
          className="w-full bg-bg-tertiary text-text-primary border border-text-disabled rounded-[6px] px-2 py-1 text-[12px] box-border mb-4"
        />

        {/* Footer */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-bg-secondary text-text-muted border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            aria-label="Save"
            onClick={handleSave}
            disabled={!title.trim() || loading}
            className="rounded-[6px] px-3.5 py-1.5 text-[12px] border"
            style={{
              background: '#1a2530',
              color: '#5b9bd5',
              borderColor: '#5b9bd533',
              cursor: 'pointer',
              opacity: !title.trim() || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
          {hasProviders === false ? (
            <span title="No providers configured — add one in Settings → Providers">
              {startNowButton}
            </span>
          ) : (
            startNowButton
          )}
        </div>
      </div>
    </div>
  )
}
