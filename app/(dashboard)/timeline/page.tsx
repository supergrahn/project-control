'use client'
import { Clock } from 'lucide-react'
import { useTimeline } from '@/hooks/useTimeline'
import { formatDistanceToNow } from 'date-fns'

const EVENT_ICONS: Record<string, string> = {
  session_started: '▶',
  session_ended: '⏹',
  audit_completed: '🔍',
  debrief_generated: '📋',
}

const EVENT_COLORS: Record<string, string> = {
  session_started: 'text-green-400',
  session_ended: 'text-zinc-400',
  audit_completed: 'text-violet-400',
  debrief_generated: 'text-blue-400',
}

export default function TimelinePage() {
  const { data, isLoading } = useTimeline()
  const entries = data?.timeline ?? []

  if (isLoading) return <p className="text-text-muted text-sm">Loading timeline...</p>

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <Clock size={18} className="text-accent-blue" /> Activity Timeline
        </h1>
        <p className="text-xs text-text-muted mt-0.5">Recent activity across all projects</p>
      </div>

      {entries.length === 0 && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <Clock size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No activity yet</p>
          <p className="text-text-muted text-xs mt-1">Events will appear here as you work across projects.</p>
        </div>
      )}

      {entries.map(entry => (
        <div key={`${entry.projectId}-${entry.featureName}`} className="mb-6">
          <h2 className="text-sm font-semibold text-text-primary mb-3">{entry.projectName}</h2>
          <div className="relative pl-6 border-l border-border-default">
            {entry.events.map((evt, i) => (
              <div key={i} className="mb-3 relative">
                <div className={`absolute -left-[25px] w-3 h-3 rounded-full border-2 border-bg-primary ${
                  evt.type === 'session_started' ? 'bg-accent-green' :
                  evt.type === 'audit_completed' ? 'bg-accent-blue' :
                  evt.type === 'debrief_generated' ? 'bg-blue-500' :
                  'bg-text-muted'
                }`} />
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${EVENT_COLORS[evt.type] ?? 'text-text-muted'}`}>
                    {EVENT_ICONS[evt.type] ?? '●'} {evt.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {formatDistanceToNow(new Date(evt.timestamp), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">{evt.summary}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
