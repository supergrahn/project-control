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
      <div className="fixed inset-0 z-50 bg-bg-overlay" onClick={onClose} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-50 w-full max-w-sm bg-bg-primary border border-border-strong rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
        </div>
        <div className="px-5 py-3">
          {SHORTCUTS.map(s => (
            <div key={s.keys} className="flex items-center justify-between py-2 border-b border-border-default/50 last:border-0">
              <span className="text-xs text-text-secondary">{s.description}</span>
              <kbd className="text-[10px] text-text-muted bg-bg-secondary px-2 py-0.5 rounded font-mono">{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
