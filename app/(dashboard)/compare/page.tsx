'use client'
import { useState } from 'react'
import { GitCompare } from 'lucide-react'
import { useProjects } from '@/hooks/useProjects'
import { useDashboard } from '@/hooks/useDashboard'
import { useGitActivity } from '@/hooks/useGitActivity'

export default function ComparePage() {
  const { data: projects = [] } = useProjects()
  const { data: dashboard } = useDashboard()
  const { data: gitData } = useGitActivity()
  const [leftId, setLeftId] = useState<string>('')
  const [rightId, setRightId] = useState<string>('')

  const left = projects.find(p => p.id === leftId)
  const right = projects.find(p => p.id === rightId)

  const getProjectStats = (projectId: string) => {
    if (!dashboard) return null
    const upNext = dashboard.upNext.filter(i => i.projectId === projectId)
    const inProgress = dashboard.inProgress.filter(i => i.projectId === projectId)
    const score = dashboard.projectScores?.find(s => s.projectId === projectId)
    const git = gitData?.projects?.find(p => p.projectId === projectId)
    return { upNext, inProgress, score, git, ideas: upNext.filter(i => i.stage === 'spec').length, specs: upNext.filter(i => i.stage === 'plan').length, plans: upNext.filter(i => i.stage === 'develop').length }
  }

  const leftStats = leftId ? getProjectStats(leftId) : null
  const rightStats = rightId ? getProjectStats(rightId) : null

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <GitCompare size={18} className="text-violet-400" /> Compare Projects
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <select value={leftId} onChange={e => setLeftId(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none">
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={rightId} onChange={e => setRightId(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none">
          <option value="">Select project...</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {leftStats && rightStats && left && right && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden">
          <div className="grid grid-cols-[150px_1fr_1fr] border-b border-zinc-800 bg-zinc-900/50">
            <div className="px-4 py-2 text-[10px] text-zinc-500 uppercase">Metric</div>
            <div className="px-4 py-2 text-xs font-semibold text-zinc-200 border-l border-zinc-800">{left.name}</div>
            <div className="px-4 py-2 text-xs font-semibold text-zinc-200 border-l border-zinc-800">{right.name}</div>
          </div>
          {[
            { label: 'Health Score', l: leftStats.score?.score ?? '—', r: rightStats.score?.score ?? '—' },
            { label: 'Ideas', l: leftStats.ideas, r: rightStats.ideas },
            { label: 'Specs', l: leftStats.specs, r: rightStats.specs },
            { label: 'Plans', l: leftStats.plans, r: rightStats.plans },
            { label: 'In Progress', l: leftStats.inProgress.length, r: rightStats.inProgress.length },
            { label: 'Branch', l: leftStats.git?.currentBranch ?? '—', r: rightStats.git?.currentBranch ?? '—' },
            { label: 'Uncommitted', l: leftStats.git?.uncommittedChanges ?? 0, r: rightStats.git?.uncommittedChanges ?? 0 },
          ].map(row => (
            <div key={row.label} className="grid grid-cols-[150px_1fr_1fr] border-b border-zinc-800/50">
              <div className="px-4 py-2 text-xs text-zinc-500">{row.label}</div>
              <div className="px-4 py-2 text-xs text-zinc-300 border-l border-zinc-800">{String(row.l)}</div>
              <div className="px-4 py-2 text-xs text-zinc-300 border-l border-zinc-800">{String(row.r)}</div>
            </div>
          ))}
        </div>
      )}

      {(!leftId || !rightId) && (
        <p className="text-zinc-600 text-sm text-center py-8">Select two projects to compare</p>
      )}
    </>
  )
}
