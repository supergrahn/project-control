'use client'
import { X } from 'lucide-react'

type Props = { diff: string | null; projectName: string; onClose: () => void }

export function DiffDrawer({ diff, projectName, onClose }: Props) {
  if (!diff) return null

  const lines = diff.split('\n')

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[700px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <span className="text-zinc-100 font-semibold text-sm">Changes in {projectName}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => {
            let cls = 'text-zinc-500'
            if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-400 bg-green-500/5'
            else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-400 bg-red-500/5'
            else if (line.startsWith('@@')) cls = 'text-blue-400'
            else if (line.startsWith('diff ')) cls = 'text-zinc-200 font-bold mt-4'
            return <div key={i} className={cls}>{line || ' '}</div>
          })}
        </div>
      </aside>
    </>
  )
}
