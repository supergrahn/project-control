'use client'
import { formatDistanceToNow } from 'date-fns'
import type { MarkdownFile } from '@/hooks/useFiles'

type Action = { label: string; onClick: () => void; variant?: 'primary' | 'default' }

type Props = {
  file: MarkdownFile
  badge: string
  actions: Action[]
  onClick: () => void
}

export function MarkdownCard({ file, badge, actions, onClick }: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden hover:border-zinc-700 transition-colors flex flex-col">
      <div className="p-4 flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2">{file.title}</h3>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">{badge}</span>
        </div>
        {file.excerpt && <p className="text-xs text-zinc-500 line-clamp-3 mb-3">{file.excerpt}</p>}
        <p className="text-[10px] text-zinc-600">{formatDistanceToNow(new Date(file.modifiedAt), { addSuffix: true })}</p>
      </div>
      <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 flex items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={(e) => { e.stopPropagation(); a.onClick() }}
            className={`text-xs px-2.5 py-1 rounded transition-colors ${
              a.variant === 'primary'
                ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
