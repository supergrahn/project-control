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
      className="fixed inset-0 bg-black bg-opacity-53 flex items-center justify-center z-50"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-bg-primary border border-border-default rounded-card p-7 w-96"
      >
        <h2 className="m-0 mb-5 text-base font-semibold text-gray-100">
          New Agent
        </h2>

        <div className="mb-4">
          <label htmlFor="agent-name" className="block mb-1.5 text-xs font-normal text-text-secondary">
            Name
          </label>
          <input
            id="agent-name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none"
          />
          {error && (
            <p className="m-0 mt-1.5 text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="agent-title" className="block mb-1.5 text-xs font-normal text-text-secondary">
            Title
          </label>
          <input
            id="agent-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="agent-provider" className="block mb-1.5 text-xs font-normal text-text-secondary">
            Provider
          </label>
          {providers.length === 0 ? (
            <p className="m-0 text-xs text-text-secondary">
              No providers configured
            </p>
          ) : (
            <select
              id="agent-provider"
              value={providerId}
              onChange={e => setProviderId(e.target.value)}
              className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none"
            >
              <option value="">— None —</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="agent-model" className="block mb-1.5 text-xs font-normal text-text-secondary">
            Model
          </label>
          <input
            id="agent-model"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="Provider default"
            className="w-full bg-gray-700 border border-border-default rounded-md px-2.5 py-2 text-gray-100 text-sm box-border outline-none"
          />
        </div>

        <div className="flex justify-end gap-2.5">
          <button
            onClick={onClose}
            className="bg-transparent border border-border-default rounded-md px-4 py-2 text-text-secondary text-xs cursor-pointer hover:border-border-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-accent-blue/15 text-accent-blue border border-accent-blue/15 rounded-[var(--radius-control)] px-4 py-2 text-xs cursor-pointer font-medium hover:bg-accent-blue/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
