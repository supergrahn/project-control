'use client'
import { useEffect, useState } from 'react'

type Provider = {
  id: string
  name: string
  type: string
}

type Props = {
  projectId: string
  onCreated: () => void
  onClose: () => void
}

export function CreateAgentModal({ projectId, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [providerId, setProviderId] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<Provider[]>([])

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json())
      .then(data => setProviders(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setError(null)
    setLoading(true)
    try {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name, title, providerId, model }),
      })
      onCreated()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#00000088',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0e1012',
          border: '1px solid #1c1f22',
          borderRadius: 10,
          padding: 28,
          width: 480,
        }}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 600, color: '#e8eaed' }}>
          New Agent
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="agent-name" style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#8a9199' }}>
            Name
          </label>
          <input
            id="agent-name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%',
              background: '#161a1d',
              border: '1px solid #1c1f22',
              borderRadius: 6,
              padding: '8px 10px',
              color: '#e8eaed',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e05252' }}>{error}</p>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="agent-title" style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#8a9199' }}>
            Title
          </label>
          <input
            id="agent-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{
              width: '100%',
              background: '#161a1d',
              border: '1px solid #1c1f22',
              borderRadius: 6,
              padding: '8px 10px',
              color: '#e8eaed',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="agent-provider" style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#8a9199' }}>
            Provider
          </label>
          {providers.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: '#8a9199' }}>
              No providers configured
            </p>
          ) : (
            <select
              id="agent-provider"
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
              style={{
                width: '100%',
                background: '#161a1d',
                border: '1px solid #1c1f22',
                borderRadius: 6,
                padding: '8px 10px',
                color: '#e8eaed',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            >
              <option value="">— None —</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: 24 }}>
          <label htmlFor="agent-model" style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#8a9199' }}>
            Model
          </label>
          <input
            id="agent-model"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="Provider default"
            style={{
              width: '100%',
              background: '#161a1d',
              border: '1px solid #1c1f22',
              borderRadius: 6,
              padding: '8px 10px',
              color: '#e8eaed',
              fontSize: 14,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid #1c1f22',
              borderRadius: 6,
              padding: '8px 16px',
              color: '#8a9199',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: '#2563eb',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              color: '#fff',
              fontSize: 13,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
