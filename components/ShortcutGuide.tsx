'use client'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { keys: '⌘ K', description: 'Command palette' },
  { keys: '⌘ I', description: 'Quick capture idea' },
  { keys: '⌘ ⇧ V', description: 'Quick paste to bookmarks' },
  { keys: '?', description: 'Show this guide' },
]

type Props = { isOpen: boolean; onClose: () => void }

export function ShortcutGuide({ isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
        </div>
        <div className="px-5 py-3">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
              <span className="text-xs text-zinc-400">{s.description}</span>
              <kbd className="text-[10px] text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
