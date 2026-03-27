'use client'
import type { OrchestratorDecision } from '@/lib/orchestrator-types'

function severityColour(s: string) {
  if (s === 'override') return 'text-red-400'
  if (s === 'warn') return 'text-amber-400'
  return 'text-blue-400'
}

function relativeTime(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type Props = {
  decisions: OrchestratorDecision[]
  onViewFullLog?: () => void
}

export function OrchestratorFeed({ decisions, onViewFullLog }: Props) {
  const shown = decisions.slice(0, 15)
  return (
    <div className="w-[220px] shrink-0 bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Orchestrator Feed</span>
        <span className="text-[10px] text-zinc-600">live</span>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto gap-0">
        {shown.map((d, i) => (
          <div key={d.id} className={`py-1.5 ${i < shown.length - 1 ? 'border-b border-zinc-800/50' : ''}`}>
            <div className="flex justify-between items-baseline">
              <span className={`font-semibold text-[10px] ${severityColour(d.severity)}`}>
                {d.source_file ? d.source_file.split('/').pop()?.replace('.md', '') : 'system'}
              </span>
              <span className="text-[9px] text-zinc-600">{relativeTime(d.created_at)}</span>
            </div>
            <div className="text-zinc-400 text-[10px] mt-0.5 leading-snug">{d.summary}</div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="text-zinc-600 text-[10px] text-center py-4">No decisions yet</div>
        )}
      </div>

      <div className="mt-2 pt-2 border-t border-zinc-800 text-center">
        <button
          onClick={onViewFullLog}
          className="text-zinc-600 text-[10px] hover:text-zinc-400 transition-colors"
        >
          View full log →
        </button>
      </div>
    </div>
  )
}
