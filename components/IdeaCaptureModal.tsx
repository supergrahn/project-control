'use client'
import { useState } from 'react'
import { X } from 'lucide-react'

type Props = {
  onCancel: () => void
  onConfirm: (data: { name: string; pitch: string }) => void
}

export function IdeaCaptureModal({ onCancel, onConfirm }: Props) {
  const [name, setName] = useState('')
  const [pitch, setPitch] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-zinc-100">New Idea</h2>
          <button onClick={onCancel} className="p-1 text-zinc-500 hover:text-zinc-300 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="idea-title" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Idea title
            </label>
            <input
              id="idea-title"
              aria-label="Idea title"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onConfirm({ name: name.trim(), pitch }) }}
              placeholder="Give your idea a name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label htmlFor="idea-pitch" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Pitch <span className="text-zinc-600 font-normal">(optional)</span>
            </label>
            <textarea
              id="idea-pitch"
              aria-label="Pitch (optional)"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              placeholder="Describe your idea in a few sentences. Claude will build on this."
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={() => name.trim() && onConfirm({ name: name.trim(), pitch })}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Ideating
          </button>
        </div>
      </div>
    </div>
  )
}
