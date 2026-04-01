'use client'
import { useState } from 'react'
import { GitBranch, GitCommit, AlertCircle } from 'lucide-react'
import { useGitActivity } from '@/hooks/useGitActivity'
import { formatDistanceToNow } from 'date-fns'
import { DiffDrawer } from '@/components/DiffDrawer'

export default function GitActivityPage() {
  const { data, isLoading, isError } = useGitActivity()
  const [diffData, setDiffData] = useState<{ diff: string | null; projectName: string } | null>(null)

  const handleViewDiff = async (projectId: string, projectName: string) => {
    const r = await fetch(`/api/git-diff?projectId=${projectId}`)
    const d = await r.json()
    setDiffData({ diff: d.diff, projectName })
  }

  if (isLoading) return <p className="text-text-muted text-sm">Scanning repositories...</p>
  if (isError || !data) return <p className="text-text-muted text-sm">Failed to scan.</p>

  const dirty = data.projects.filter(p => p.uncommittedChanges > 0)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <GitBranch size={18} className="text-accent-blue" /> Git Activity
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          {data.projects.length} projects · {dirty.length} with uncommitted changes
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {data.projects.map(p => (
          <div key={p.projectId} className={`bg-bg-primary border rounded-lg overflow-hidden ${
            p.uncommittedChanges > 0 ? 'border-accent-orange/30' : 'border-border-default'
          }`}>
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">{p.projectName}</h3>
                  {p.currentBranch && (
                    <span className="text-[10px] bg-bg-secondary text-text-secondary px-2 py-0.5 rounded-full font-mono">
                      {p.currentBranch}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {p.uncommittedChanges > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-accent-orange">
                      <AlertCircle size={10} /> {p.uncommittedChanges} uncommitted
                    </span>
                  )}
                  {p.uncommittedChanges > 0 && (
                    <button onClick={() => handleViewDiff(p.projectId, p.projectName)}
                      className="text-[10px] text-accent-blue hover:text-accent-blue/80">View Diff</button>
                  )}
                  {p.lastCommitDate && (
                    <span className="text-[10px] text-text-muted">
                      {formatDistanceToNow(new Date(p.lastCommitDate), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
              {p.recentCommits.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {p.recentCommits.map((commit, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <GitCommit size={10} className="text-text-muted shrink-0" />
                      <span className="text-text-secondary font-mono truncate">{commit}</span>
                    </div>
                  ))}
                </div>
              )}
              {p.recentCommits.length === 0 && (
                <p className="text-xs text-text-muted">No commits yet</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {diffData && <DiffDrawer diff={diffData.diff} projectName={diffData.projectName} onClose={() => setDiffData(null)} />}
    </>
  )
}
