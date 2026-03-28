'use client'
import { useEffect, useRef } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { useSessions } from '@/hooks/useSessions'
import { useOrchestratorFeed } from '@/hooks/useOrchestratorFeed'
import { formatDistanceToNow } from 'date-fns'

type Props = {
  isOpen: boolean
  onClose: () => void
}

type PhaseColors = {
  badge: string
  border: string
  dot: string
  text: string
}

function phaseColors(phase: string): PhaseColors {
  const p = phase.toLowerCase()
  if (p === 'idea' || p === 'ideate') return { badge: 'bg-purple-600', border: 'border-l-purple-500', dot: 'bg-purple-400', text: 'text-purple-400' }
  if (p === 'spec') return { badge: 'bg-blue-600', border: 'border-l-blue-500', dot: 'bg-blue-400', text: 'text-blue-400' }
  if (p === 'plan') return { badge: 'bg-amber-500', border: 'border-l-amber-400', dot: 'bg-amber-400', text: 'text-amber-400' }
  if (p === 'develop' || p === 'developing') return { badge: 'bg-green-600', border: 'border-l-green-500', dot: 'bg-green-400', text: 'text-green-400' }
  return { badge: 'bg-violet-600', border: 'border-l-violet-500', dot: 'bg-violet-400', text: 'text-violet-400' }
}

function relativeTime(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export function OrchestratorDrawer({ isOpen, onClose }: Props) {
  const { data: sessions = [] } = useSessions({ status: 'all' })
  const activeSessions = sessions.filter((s) => s.status === 'active')
  const { feed } = useOrchestratorFeed(isOpen ? activeSessions : [])
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [feed])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const active = sessions.filter((s) => s.status === 'active')
  const ended = sessions.filter((s) => s.status !== 'active')
  const ordered = [...active, ...ended]

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Orchestrator</span>
          {active.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              {active.length} active
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
          <X size={14} />
        </button>
      </div>

      {/* Module list */}
      <div className="shrink-0 overflow-y-auto max-h-[45%]">
        {ordered.length === 0 && (
          <p className="text-[11px] text-zinc-600 text-center py-6">No active sessions</p>
        )}
        {ordered.map((session, i) => {
          const colors = phaseColors(session.phase)
          const isActive = session.status === 'active'
          return (
            <div
              key={session.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-zinc-800/60 border-l-2 transition-colors ${
                isActive
                  ? `${colors.border} bg-zinc-900`
                  : 'border-l-transparent'
              } ${!isActive ? 'opacity-50' : ''}`}
            >
              <div className={`w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold text-white ${colors.badge} ${!isActive ? 'opacity-60' : ''}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-zinc-100 truncate">{session.label}</p>
              </div>
              <div className="shrink-0">
                {isActive ? (
                  <span className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse block`} />
                ) : (
                  <CheckCircle size={14} className="text-zinc-500" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800 shrink-0" />

      {/* Combined feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-0.5">
        {feed.length === 0 && (
          <p className="text-[10px] text-zinc-700 text-center py-4">Waiting for output...</p>
        )}
        {feed.map((entry) => {
          const colors = phaseColors(entry.phase)
          return (
            <div key={entry.id} className="flex items-start gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} mt-1.5 shrink-0`} />
              <span className={`text-[10px] font-medium shrink-0 ${colors.text} max-w-[60px] truncate`}>
                {entry.label}
              </span>
              <span className="text-[10px] text-zinc-600 shrink-0">
                {relativeTime(entry.timestamp)}
              </span>
              <span className="font-mono text-[10px] text-zinc-400 truncate flex-1">
                {entry.text.replace(/\n$/, '')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
