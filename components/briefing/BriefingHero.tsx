'use client'
import { useState, useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import type { BriefingResponse } from '@/lib/briefing/types'

type Props = {
  data: BriefingResponse
  onRefresh: () => Promise<void>
}

export function BriefingHero({ data, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [lastSeenGenAt, setLastSeenGenAt] = useState<string | null>(data.snapshot?.generatedAt ?? null)

  useEffect(() => {
    if (data.snapshot && lastSeenGenAt && data.snapshot.generatedAt !== lastSeenGenAt) {
      setRefreshing(false)
      setLastSeenGenAt(data.snapshot.generatedAt)
    } else if (data.snapshot && !lastSeenGenAt) {
      setLastSeenGenAt(data.snapshot.generatedAt)
    }
  }, [data.snapshot?.generatedAt, lastSeenGenAt, data.snapshot])

  async function handleRefresh() {
    setRefreshing(true)
    setLastSeenGenAt(data.snapshot?.generatedAt ?? null)
    await onRefresh()
  }

  if (!data.snapshot) {
    return (
      <section className="bg-bg-primary border border-border-default rounded-lg p-4 mb-4">
        <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Sparkles size={14} className="text-accent-blue" /> Morning briefing
        </h2>
        <p className="text-xs text-text-muted mt-1">Synthesizing morning briefing…</p>
      </section>
    )
  }

  // Build refId-set per section for stale-refId filtering
  const validRefs: Record<string, Set<string>> = {
    next_actions: new Set(data.openNextActions.map(x => x.sessionId)),
    critic_flagged: new Set(data.criticFlagged.map(x => String(x.findingId))),
    top_tasks: new Set(data.topTasks.map(x => x.taskId)),
    recent_failures: new Set(data.recentFailures.map(x => x.sessionId)),
    duplicate_tasks: new Set(data.duplicateTasks.map(x => `${x.aTaskId}::${x.bTaskId}`)),
  }
  const visibleActions = data.snapshot.priorityActions.filter(a => validRefs[a.sectionKey]?.has(a.refId) ?? false)

  return (
    <section className="bg-bg-primary border border-border-default rounded-lg p-4 mb-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-accent-blue" /> Morning briefing
      </h2>
      <p className="text-sm text-text-secondary mb-3">{data.snapshot.narrative}</p>
      {visibleActions.length > 0 && (
        <ul className="flex flex-col gap-1 mb-3">
          {visibleActions.map((a, i) => (
            <li key={`${a.sectionKey}:${a.refId}:${i}`} className="text-xs text-text-muted">
              <span className="text-text-secondary">{a.sectionKey}</span> · {a.reason}
            </li>
          ))}
        </ul>
      )}
      <div className="text-[10px] text-text-faint flex items-center gap-2">
        <span>Generated {new Date(data.snapshot.generatedAt).toLocaleString()} by {data.snapshot.model}</span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded border border-border-default bg-bg-secondary px-2 py-0.5 text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          aria-label="Refresh briefing"
        >
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>
    </section>
  )
}
