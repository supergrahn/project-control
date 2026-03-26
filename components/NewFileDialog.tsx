'use client'
import { useState } from 'react'

type Props = {
  onConfirm: (name: string) => void
  onCancel: () => void
  label: string
}

export function NewFileDialog({ onConfirm, onCancel, label }: Props) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 w-80 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">New {label}</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm(name.trim()); if (e.key === 'Escape') onCancel() }}
          placeholder={`${label} name...`}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500 mb-3"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
