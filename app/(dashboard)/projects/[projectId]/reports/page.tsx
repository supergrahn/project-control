'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSessions } from '@/hooks/useSessions'
import { useProjectStore } from '@/hooks/useProjects'
import { SessionCard } from '@/components/SessionCard'
import { OrchestratorFeed } from '@/components/OrchestratorFeed'
import type { OrchestratorDecision } from '@/lib/orchestrator-types'

function useDecisions() {
  const [decisions, setDecisions] = useState<OrchestratorDecision[]>([])
  useEffect(() => {
    const es = new EventSource('/api/sse/decisions')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { decisions: OrchestratorDecision[] }
        setDecisions(prev => {
          const ids = new Set(prev.map(d => d.id))
          const newOnes = data.decisions.filter(d => !ids.has(d.id))
          return [...newOnes, ...prev].slice(0, 50)
        })
      } catch {}
    }
    return () => es.close()
  }, [])
  return decisions
}

function useOrchestrators() {
  return useQuery<{ orchestrators: Array<{ id: string; project_id: string; status: string }> }>({
    queryKey: ['orchestrators'],
    queryFn: () => fetch('/api/orchestrators').then(r => r.json()),
    refetchInterval: 10000,
  })
}

export default function ReportsPage() {
  const { selectedProject } = useProjectStore()
  const { data: allSessions = [] } = useSessions({ status: 'all' })
  const { data: orchData } = useOrchestrators()
  const decisions = useDecisions()

  const sessions = selectedProject
    ? allSessions.filter(s => s.project_id === selectedProject.id)
    : []

  const orch = selectedProject
    ? (orchData?.orchestrators ?? []).find(o => o.project_id === selectedProject.id)
    : undefined

  const activeCount = sessions.filter(s => s.status === 'active').length

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold text-text-primary">Reports</h1>
          <span className="text-xs text-text-muted">{activeCount} active</span>
          {orch && orch.status === 'active' && (
            <span className="text-[10px] bg-accent-blue/20 text-accent-blue px-2 py-0.5 rounded-full">🤖 orchestrator</span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ alignItems: 'stretch' }}>
          {sessions.map(s => {
            const latestDecision = selectedProject
              ? decisions.find(d => d.project_id === selectedProject.id && d.source_file === s.source_file) ?? null
              : null
            return <SessionCard key={s.id} session={s} latestDecision={latestDecision} />
          })}
        </div>
        {sessions.length === 0 && (
          <div className="text-text-muted text-sm text-center py-10">
            No sessions yet. Start a session from the Plans page.
          </div>
        )}
      </div>
      <OrchestratorFeed decisions={decisions} />
    </div>
  )
}
