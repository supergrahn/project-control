'use client'
import { formatDistanceToNow } from 'date-fns'
import type { MarkdownFile } from '@/hooks/useFiles'

type Action = { label: string; onClick: () => void; variant?: 'primary' | 'default' }
type SessionState = { sessionId: string | null; logId: string | null }

type Props = {
  file: MarkdownFile
  badge: string
  actions: Action[]
  onClick: () => void
  phaseSessionState?: SessionState
  onLiveBadgeClick?: () => void
  onViewLog?: () => void
  onResume?: () => void
}

export function MarkdownCard({ file, badge, actions, onClick, phaseSessionState, onLiveBadgeClick, onViewLog, onResume }: Props) {
  const isActive = !!phaseSessionState?.sessionId && !phaseSessionState.logId
  const isClosed = !!phaseSessionState?.sessionId && !!phaseSessionState.logId

  return (
    <div className="bg-bg-primary border border-border-default rounded-lg overflow-hidden hover:border-border-strong transition-colors flex flex-col">
      <div className="p-4 flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-text-primary line-clamp-2">{file.title}</h3>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-accent-blue/20 text-accent-blue">{badge}</span>
        </div>
        {file.excerpt && <p className="text-xs text-text-muted line-clamp-3 mb-3">{file.excerpt}</p>}
        <p className="text-[10px] text-text-faint">{formatDistanceToNow(new Date(file.modifiedAt), { addSuffix: true })}</p>
      </div>
      <div className="border-t border-border-default bg-bg-base px-3 py-2 flex items-center gap-2 flex-wrap">
        {isActive ? (
          <button
            onClick={(e) => { e.stopPropagation(); onLiveBadgeClick?.() }}
            className="text-xs px-2.5 py-1 rounded bg-accent-green/20 text-accent-green hover:bg-accent-green/30 flex items-center gap-1"
          >
            ▶ Live
          </button>
        ) : isClosed ? (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onViewLog?.() }}
              className="text-xs px-2.5 py-1 rounded bg-bg-secondary text-text-secondary hover:text-text-primary"
            >
              View log
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onResume?.() }}
              className="text-xs px-2.5 py-1 rounded bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
            >
              Resume
            </button>
          </>
        ) : (
          actions.map((a) => (
            <button
              key={a.label}
              onClick={(e) => { e.stopPropagation(); a.onClick() }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                a.variant === 'primary'
                  ? 'bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30'
                  : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
              }`}
            >
              {a.label}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
