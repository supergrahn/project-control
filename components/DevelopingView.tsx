'use client'
import { useState } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { CardGrid } from './CardGrid'
import { SessionCard } from './cards/SessionCard'
import { useSessions, useKillSession, type Session } from '@/hooks/useSessions'

type Props = {
  onOpenSession: (s: Session) => void
}

export function DevelopingView({ onOpenSession }: Props) {
  const { data: sessions = [], isLoading } = useSessions()
  const killSession = useKillSession()
  const [view, setView] = useState<'cards' | 'table'>('cards')

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading sessions...</p>
  if (sessions.length === 0) return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">⚡ Developing</h1>
      </div>
      <p className="text-zinc-500 text-sm">No active sessions.</p>
    </div>
  )

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">⚡ Developing</h1>
        <div className="flex gap-1">
          <button onClick={() => setView('cards')} className={`p-1.5 rounded ${view === 'cards' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><LayoutGrid size={16} /></button>
          <button onClick={() => setView('table')} className={`p-1.5 rounded ${view === 'table' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}><List size={16} /></button>
        </div>
      </div>

      {view === 'cards' ? (
        <CardGrid>
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onOpen={() => onOpenSession(s)} onStop={() => killSession.mutate(s.id)} />
          ))}
        </CardGrid>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Phase</th>
              <th className="pb-2 pr-4">Started</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-b border-zinc-900">
                <td className="py-2 pr-4 text-zinc-200">{s.label}</td>
                <td className="py-2 pr-4 text-zinc-400 capitalize">{s.phase}</td>
                <td className="py-2 pr-4 text-zinc-500 text-xs">{formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}</td>
                <td className="py-2 flex gap-2">
                  <button onClick={() => onOpenSession(s)} className="text-xs px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded">Open</button>
                  <button onClick={() => killSession.mutate(s.id)} className="text-xs px-2 py-0.5 bg-red-500/10 text-red-400 rounded">Stop</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
