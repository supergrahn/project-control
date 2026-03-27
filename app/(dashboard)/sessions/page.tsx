'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useSessions } from '@/hooks/useSessions'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { SessionCard } from '@/components/SessionCard'
import { OrchestratorFeed } from '@/components/OrchestratorFeed'
import type { OrchestratorDecision, SessionProposedAction } from '@/lib/orchestrator-types'

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

export default function SessionsPage() {
  const { data: projects = [] } = useProjects()
  const { data: sessionsData = [] } = useSessions({ status: 'all' })
  const { data: orchData } = useOrchestrators()
  const decisions = useDecisions()
  const { openProject } = useProjectStore()
  const router = useRouter()

  const orchMap = new Map((orchData?.orchestrators ?? []).map(o => [o.project_id, o]))

  // Group sessions by project
  const sessionsByProject = new Map<string, typeof sessionsData>()
  for (const s of sessionsData) {
    const list = sessionsByProject.get(s.project_id) ?? []
    list.push(s)
    sessionsByProject.set(s.project_id, list)
  }

  const activeCount = sessionsData.filter(s => s.status === 'active').length
  const gateCount = 0 // TODO: compute from proposed actions

  return (
    <div className="flex gap-4 h-full">
      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-lg font-semibold text-zinc-100">Sessions</h1>
          <span className="text-xs text-zinc-500">{projects.length} projects</span>
          <span className="text-xs text-zinc-500">{activeCount} active</span>
          {gateCount > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">{gateCount} gates waiting</span>
          )}
        </div>

        {/* Per-project sections */}
        {projects.map(project => {
          const sessions = sessionsByProject.get(project.id) ?? []
          if (sessions.length === 0) return null
          const orch = orchMap.get(project.id)

          return (
            <div key={project.id} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h2
                  className="text-sm font-semibold text-zinc-200 cursor-pointer hover:text-violet-300 transition-colors"
                  onClick={() => { openProject(project); router.push('/') }}
                >
                  {project.name}
                </h2>
                {orch && orch.status === 'active' && (
                  <span className="text-[10px] bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">🤖 orchestrator</span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2" style={{ alignItems: 'stretch' }}>
                {sessions.map(s => {
                  const latestDecision = decisions.find(d => d.project_id === project.id && d.source_file === s.source_file) ?? null
                  return (
                    <SessionCard
                      key={s.id}
                      session={s}
                      latestDecision={latestDecision}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}

        {sessionsData.length === 0 && (
          <div className="text-zinc-600 text-sm text-center py-10">
            No sessions yet. Start a session from the Plans page.
          </div>
        )}
      </div>

      {/* Feed sidebar */}
      <OrchestratorFeed decisions={decisions} />
    </div>
  )
}
