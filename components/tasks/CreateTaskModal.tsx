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
      style={{
        background: '#0d1a2d',
        color: hasProviders !== false ? '#5b9bd5' : '#3a4550',
        border: '1px solid #5b9bd522',
        borderRadius: 6,
        padding: '6px 14px',
        fontSize: 12,
        cursor: hasProviders !== false && title.trim() && !loading ? 'pointer' : 'not-allowed',
        opacity: hasProviders === false || !title.trim() || loading ? 0.5 : 1,
      }}
    >
      {loading ? 'Starting…' : 'Start now'}
    </button>
  )

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: '#00000088', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0e1012', border: '1px solid #1c1f22', borderRadius: 10,
          padding: 28, width: 560, maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ color: '#e2e6ea', fontSize: 15, fontWeight: 700, marginBottom: 16, fontFamily: 'system-ui' }}>
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
          style={{
            width: '100%', background: '#141618', border: '1px solid #1c1f22',
            borderRadius: 6, padding: '8px 10px', color: '#e2e6ea', fontSize: 13,
            marginBottom: 10, boxSizing: 'border-box', fontFamily: 'system-ui',
          }}
        />

        {/* Description */}
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          style={{
            width: '100%', background: '#141618', border: '1px solid #1c1f22',
            borderRadius: 6, padding: '8px 10px', color: '#8a9199', fontSize: 12,
            minHeight: 80, resize: 'vertical', marginBottom: 16,
            boxSizing: 'border-box', fontFamily: 'system-ui',
          }}
        />

        {/* Priority */}
        <div style={{ color: '#5a6370', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Priority
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {PRIORITIES.map(p => {
            const isActive = priority === p
            return (
              <button
                key={p}
                onClick={() => setPriority(p)}
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
        <div style={{ color: '#5a6370', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Labels
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {labels.map((label, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                background: '#1a1d20', color: '#8a9199', borderRadius: 4,
                padding: '2px 6px', fontSize: 11,
              }}
            >
              {label}
              <button
                aria-label="×"
                onClick={() => handleLabelRemove(i)}
                style={{
                  background: 'none', border: 'none', color: '#5a6370',
                  cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1,
                }}
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
          style={{
            width: '100%', background: '#1a1d20', color: '#e2e6ea',
            border: '1px solid #2e3338', borderRadius: 6, padding: '5px 8px',
            fontSize: 12, boxSizing: 'border-box', marginBottom: 16,
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#141618', color: '#5a6370', border: '1px solid #1c1f22',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            aria-label="Save"
            onClick={handleSave}
            disabled={!title.trim() || loading}
            style={{
              background: '#1a2530', color: '#5b9bd5', border: '1px solid #5b9bd522',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
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
