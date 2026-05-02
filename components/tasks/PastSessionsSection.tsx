'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import type { Session } from '@/hooks/useSessions'
import { formatDistanceToNow } from 'date-fns'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { projectId: string; taskId: string }

export function PastSessionsSection({ projectId, taskId }: Props) {
  const router = useRouter()
  const { data: sessions = [], isLoading } = useSessions({ projectId, status: 'all' })
  const past = sessions.filter(s => s.task_id === taskId && !!s.ended_at)

  if (isLoading) return null

  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Past Sessions</h3>
      {past.length === 0 ? (
        <p className="text-xs text-text-muted">No past sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {past.map(s => (
            <SessionCard key={s.id} session={s} onOpen={() => router.push('/sessions?selected=' + s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionCard({ session, onOpen }: { session: Session; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const startedRel = formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
  const endedRel = session.ended_at ? formatDistanceToNow(new Date(session.ended_at), { addSuffix: true }) : null

  let summarySlot: React.ReactNode
  if (isActive) {
    summarySlot = <span className="text-text-muted text-xs italic">Session in progress…</span>
  } else if (session.summary) {
    summarySlot = (
      <div>
        <p className={`text-xs text-text-primary whitespace-pre-wrap ${expanded ? '' : 'line-clamp-3'}`}>
          {session.summary}
        </p>
        {session.summary.split('\n').length > 3 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(v => !v)
            }}
            className="text-[11px] text-accent-blue mt-1"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>
    )
  } else {
    summarySlot = <span className="text-text-faint text-xs italic">No final message captured.</span>
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="bg-bg-secondary border border-border-subtle rounded-lg p-3 cursor-pointer hover:border-border-hover transition"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
          {initials}
        </span>
        <span className="text-text-primary text-sm font-semibold flex-1 truncate">{session.label}</span>
        <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
          {isActive ? '● Live' : 'Finished'}
        </span>
      </div>
      <div className="text-text-muted text-[11px] mb-2">
        started {startedRel}
        <span className="mx-1.5 text-text-faint">·</span>
        {session.phase}
        {endedRel && (
          <>
            <span className="mx-1.5 text-text-faint">·</span>
            ended {endedRel}
          </>
        )}
      </div>
      {summarySlot}
      <div className="text-[11px] text-accent-blue mt-2">Open session →</div>
    </div>
  )
}
