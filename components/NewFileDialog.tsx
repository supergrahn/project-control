'use client'
import { useState, useEffect } from 'react'

type Props = {
  onConfirm: (name: string) => void
  onCancel: () => void
  label: string
}

export function NewFileDialog({ onConfirm, onCancel, label }: Props) {
  const [name, setName] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay">
      <div className="bg-bg-primary border border-border-strong rounded-lg p-5 w-80 shadow-xl">
        <h3 className="text-sm font-semibold text-text-primary mb-3">New {label}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); if (e.key === 'Escape') onCancel() }}
          placeholder={`${label} name...`}
          className="w-full bg-bg-secondary border border-border-strong rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary">Cancel</button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm bg-accent-blue hover:bg-accent-blue text-white rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
