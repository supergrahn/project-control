'use client'
import { formatDistanceToNow } from 'date-fns'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type Props = { session: Session }

export function SessionGridCard({ session }: Props) {
  const { data: projects = [] } = useProjects()
  const projectName = projects.find(p => p.id === session.project_id)?.name ?? session.project_id
  const killSession = useKillSession()
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const startedRel = formatDistanceToNow(new Date(session.created_at), { addSuffix: true })
  const endedRel = session.ended_at
    ? formatDistanceToNow(new Date(session.ended_at), { addSuffix: true })
    : null

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
      {/* Header: phase badge left, status pill right */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border-subtle">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
          {initials}
        </span>
        <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
          {isActive ? '● Live' : 'Finished'}
        </span>
      </div>

      {/* Body: project name + label */}
      <div className="px-3.5 py-3">
        <div className="text-[10px] text-text-faint uppercase tracking-wide truncate">{projectName}</div>
        <div className="text-text-primary text-sm font-semibold mt-0.5 truncate">{session.label}</div>
        <div className="text-text-muted text-[11px] mt-1.5">
          <span>started {startedRel}</span>
          <span className="mx-1.5 text-text-faint">·</span>
          <span>{session.phase}</span>
          {endedRel && (
            <>
              <span className="mx-1.5 text-text-faint">·</span>
              <span>ended {endedRel}</span>
            </>
          )}
        </div>
      </div>

      {/* Footer: Stop button (active only) */}
      {isActive && (
        <div className="flex justify-end px-3.5 pb-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              killSession.mutate(session.id)
            }}
            className="bg-transparent border border-accent-red text-accent-red rounded-md px-3 py-1 text-xs cursor-pointer hover:opacity-80"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
