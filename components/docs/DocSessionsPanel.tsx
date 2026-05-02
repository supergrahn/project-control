'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { Session } from '@/hooks/useSessions'
import { formatDistanceToNow } from 'date-fns'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { projectId: string; relativePath: string }

type SimilarMatch = { kind: string; ref: string; score: number }

export function DocSessionsPanel({ projectId, relativePath }: Props) {
  const router = useRouter()
  const { data: sessions = [], isLoading } = useSWR<Session[]>(
    `/api/projects/${projectId}/docs/sessions?file=${encodeURIComponent(relativePath)}`,
    fetcher,
  )

  // Embedding-based "related sessions from elsewhere" — returns [] until the
  // doc has been embedded (background job), at which point similar sessions
  // surface on next render. POST is required so the body can describe both
  // the source kind/ref and the target resultKinds without URL bloat.
  const { data: similar = [] } = useSWR<SimilarMatch[]>(
    `/api/projects/${projectId}/embeddings/similar:doc:${relativePath}`,
    () =>
      fetch(`/api/projects/${projectId}/embeddings/similar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'doc',
          ref: relativePath,
          resultKinds: ['session_summary'],
          limit: 5,
        }),
      }).then((r) => (r.ok ? r.json() : [])),
  )

  if (isLoading) return null
  if (sessions.length === 0) {
    return (
      <div className="mt-8 pt-6 border-t border-border-default">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Sessions</h3>
        <p className="text-xs text-text-muted">No sessions yet for this doc.</p>
        <SimilarSessionsList similar={similar} />
      </div>
    )
  }

  return (
    <div className="mt-8 pt-6 border-t border-border-default">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-3">Sessions</h3>
      <div className="space-y-3">
        {sessions.map(s => (
          <SessionCard key={s.id} session={s} onOpen={() => router.push('/sessions?selected=' + s.id)} />
        ))}
      </div>
      <SimilarSessionsList similar={similar} />
    </div>
  )
}

function SimilarSessionsList({ similar }: { similar: SimilarMatch[] }) {
  if (similar.length === 0) return null
  return (
    <div className="mt-6 pt-4 border-t border-border-default">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
        Related sessions from elsewhere
      </h4>
      <ul className="text-xs space-y-1">
        {similar.map((m) => (
          <li key={`${m.kind}:${m.ref}`}>
            <a
              className="text-accent-blue hover:underline"
              href={`/sessions?selected=${m.ref}`}
            >
              session {m.ref.slice(0, 8)}
            </a>
            <span className="text-text-muted ml-2">({Math.round(m.score * 100)}% match)</span>
          </li>
        ))}
      </ul>
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
