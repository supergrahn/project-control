'use client'
import { useState, useRef, useEffect } from 'react'
import { createTask } from '@/hooks/useTasks'

type Props = {
  projectId: string
  onCreated: () => void
  onClose: () => void
}

export function NewTaskModal({ projectId, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      await createTask(projectId, title.trim())
      onCreated()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#00000088', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onClose}>
      <div style={{
        background: '#0e1012', border: '1px solid #1c1f22', borderRadius: 10,
        padding: 24, width: 460, maxWidth: '90vw',
      }} onClick={e => e.stopPropagation()}>

        <div style={{ color: '#e2e6ea', fontSize: 15, fontWeight: 700, marginBottom: 16, fontFamily: 'system-ui' }}>
          New Task
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title"
            style={{
              width: '100%', background: '#141618', border: '1px solid #1c1f22',
              borderRadius: 6, padding: '8px 10px', color: '#e2e6ea', fontSize: 13,
              marginBottom: 10, boxSizing: 'border-box', fontFamily: 'system-ui',
            }}
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Starting idea (optional) — used as prompt seed for first session"
            style={{
              width: '100%', background: '#141618', border: '1px solid #1c1f22',
              borderRadius: 6, padding: '8px 10px', color: '#8a9199', fontSize: 12,
              minHeight: 80, resize: 'vertical', marginBottom: 16,
              boxSizing: 'border-box', fontFamily: 'system-ui',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              background: '#141618', color: '#5a6370', border: '1px solid #1c1f22',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || loading} style={{
              background: '#1a2530', color: '#5b9bd5', border: '1px solid #5b9bd522',
              borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
              opacity: !title.trim() || loading ? 0.5 : 1,
            }}>
              {loading ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}
