'use client'
import { X } from 'lucide-react'

type Props = { diff: string | null; projectName: string; onClose: () => void }

export function DiffDrawer({ diff, projectName, onClose }: Props) {
  if (!diff) return null

  const lines = diff.split('\n')

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[700px] z-50 bg-bg-primary border-l border-border-default flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default shrink-0">
          <span className="text-text-primary font-semibold text-sm">Changes in {projectName}</span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1 rounded hover:bg-bg-secondary">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => {
            let cls = 'text-text-muted'
            if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-accent-green bg-accent-green/5'
            else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-accent-red bg-accent-red/5'
            else if (line.startsWith('@@')) cls = 'text-accent-blue'
            else if (line.startsWith('diff ')) cls = 'text-text-primary font-bold mt-4'
            return <div key={i} className={cls}>{line || ' '}</div>
          })}
        </div>
      </aside>
    </>
  )
}
