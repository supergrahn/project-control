'use client'
import { useSessionWindows } from '@/hooks/useSessionWindows'

export function SessionPillBar() {
  const { windows, restoreWindow } = useSessionWindows()
  const minimized = windows.filter((w) => w.minimized)
  if (minimized.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-[2000]">
      {minimized.map((w) => (
        <button
          key={w.session.id}
          onClick={() => restoreWindow(w.session.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-secondary border border-border-strong rounded-full text-xs text-text-primary hover:text-text-primary hover:bg-bg-tertiary shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
          {w.session.label}
        </button>
      ))}
    </div>
  )
}
