'use client'
import type { Session } from '@/hooks/useSessions'
import { SessionGridCard } from './SessionGridCard'

type Props = {
  sessions: Session[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  emptyMessage: string
}

export function SessionsGrid({ sessions, isLoading, selectedId, onSelect, emptyMessage }: Props) {
  if (isLoading) return <p className="text-text-muted text-sm">Loading sessions…</p>
  if (sessions.length === 0) return <p className="text-text-muted text-sm">{emptyMessage}</p>

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {sessions.map(s => (
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(s.id)
            }
          }}
          className={`rounded-lg cursor-pointer transition ${
            selectedId === s.id ? 'ring-2 ring-accent-blue' : ''
          }`}
        >
          <SessionGridCard session={s} />
        </div>
      ))}
    </div>
  )
}
