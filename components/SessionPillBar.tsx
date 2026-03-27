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
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 shadow-lg"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {w.session.label}
        </button>
      ))}
    </div>
  )
}
