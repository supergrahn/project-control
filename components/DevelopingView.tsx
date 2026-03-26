'use client'
import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { formatDistanceToNow, formatDuration, intervalToDuration } from 'date-fns'
import { CardGrid } from './CardGrid'
import { SessionCard } from './cards/SessionCard'
import { useSessions, useKillSession, type Session } from '@/hooks/useSessions'
import { useProjectStore } from '@/hooks/useProjects'

type Props = {
  onOpenSession: (s: Session) => void
}

const PHASE_COLOR: Record<string, string> = {
  brainstorm: 'text-sky-400',
  spec: 'text-violet-400',
  plan: 'text-amber-400',
  develop: 'text-emerald-400',
  review: 'text-pink-400',
}

function duration(start: string, end: string | null): string {
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const d = intervalToDuration({ start: 0, end: ms })
  return formatDuration(d, { format: ['hours', 'minutes'] }) || '0m'
}

export function DevelopingView({ onOpenSession }: Props) {
  const { selectedProject } = useProjectStore()
  const { data: activeSessions = [], isLoading: loadingActive } = useSessions()
  const { data: allSessions = [], isLoading: loadingAll } = useSessions({ status: 'all' })
  const killSession = useKillSession()
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [view, setView] = useState<'cards' | 'table'>('cards')

  const filterByProject = <T extends { project_id: string }>(items: T[]) =>
    selectedProject ? items.filter((s) => s.project_id === selectedProject.id) : items

  const visibleActive = filterByProject(activeSessions)
  const endedSessions = allSessions.filter((s) => s.status === 'ended')
  const visibleEnded = filterByProject(endedSessions)
  const current = tab === 'active' ? visibleActive : visibleEnded
  const isLoading = tab === 'active' ? loadingActive : loadingAll

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-zinc-100">⚡ Developing</h1>
          <div className="flex text-sm">
            <button
              onClick={() => setTab('active')}
              className={`px-3 py-1 rounded-l border ${tab === 'active' ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
            >
              Active {visibleActive.length > 0 && <span className="ml-1 text-xs text-emerald-400">{visibleActive.length}</span>}
            </button>
            <button
              onClick={() => setTab('history')}
              className={`px-3 py-1 rounded-r border-t border-b border-r ${tab === 'history' ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
            >
              History
            </button>
          </div>
          {selectedProject && <span className="text-xs text-zinc-600">for {selectedProject.name}</span>}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setView('cards')} className={`p-1.5 rounded ${view === 'cards' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><List size={16} /></button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : current.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          {tab === 'active' ? 'No active sessions.' : 'No session history yet.'}
        </p>
      ) : view === 'cards' ? (
        <CardGrid>
          {tab === 'active'
            ? current.map((s) => (
                <SessionCard key={s.id} session={s} onOpen={() => onOpenSession(s)} onStop={() => killSession.mutate(s.id)} />
              ))
            : current.map((s) => <HistoryCard key={s.id} session={s} />)
          }
        </CardGrid>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Phase</th>
              <th className="pb-2 pr-4">{tab === 'active' ? 'Started' : 'Ended'}</th>
              <th className="pb-2 pr-4">Duration</th>
              {tab === 'active' && <th className="pb-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {current.map((s) => (
              <tr key={s.id} className="border-b border-zinc-900">
                <td className="py-2 pr-4 text-zinc-200">{s.label}</td>
                <td className={`py-2 pr-4 capitalize text-xs ${PHASE_COLOR[s.phase] ?? 'text-zinc-400'}`}>{s.phase}</td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">
                  {formatDistanceToNow(new Date(s.ended_at ?? s.created_at), { addSuffix: true })}
                </td>
                <td className="py-2 pr-4 text-zinc-600 text-xs">{duration(s.created_at, s.ended_at)}</td>
                {tab === 'active' && (
                  <td className="py-2 flex gap-2">
                    <button onClick={() => onOpenSession(s)} className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded">Open</button>
                    <button onClick={() => killSession.mutate(s.id)} className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 rounded">Stop</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function HistoryCard({ session: s }: { session: Session }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-300 line-clamp-2">{s.label}</p>
        <span className={`text-[10px] capitalize shrink-0 ${PHASE_COLOR[s.phase] ?? 'text-zinc-500'}`}>{s.phase}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500 mt-auto">
        <span>{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</span>
        <span>·</span>
        <span>{duration(s.created_at, s.ended_at)}</span>
      </div>
    </div>
  )
}
