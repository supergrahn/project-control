'use client'
import { Package, AlertTriangle } from 'lucide-react'
import { useTechAudit } from '@/hooks/useTechAudit'

export default function TechAuditPage() {
  const { data, isLoading, isError } = useTechAudit()

  if (isLoading) return <p className="text-zinc-500 text-sm">Scanning projects...</p>
  if (isError || !data) return <p className="text-zinc-500 text-sm">Failed to scan.</p>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Package size={18} className="text-violet-400" /> Tech Stack Audit
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {data.projects.length} projects scanned · {data.drift.length} packages with version drift
          </p>
        </div>
      </div>

      {/* Drift table */}
      {data.drift.length > 0 && (
        <div className="rounded-lg border border-zinc-800 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Version Drift</h2>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {data.drift.slice(0, 20).map(d => (
              <div key={d.package} className="px-4 py-2.5">
                <span className="text-sm font-mono text-zinc-200">{d.package}</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {d.versions.map((v, i) => (
                    <span key={i} className="text-[10px] bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5">
                      <span className="text-zinc-500">{v.projectName}:</span> <span className="text-amber-300">{v.version}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.drift.length === 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center mb-6">
          <Package size={28} className="text-green-500 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">No version drift detected</p>
          <p className="text-zinc-600 text-xs mt-1">All shared packages use consistent versions.</p>
        </div>
      )}

      {/* Project summary */}
      <div className="grid grid-cols-3 gap-3">
        {data.projects.map(p => (
          <div key={p.projectId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">{p.projectName}</h3>
            <p className="text-xs text-zinc-500">{p.packageCount} packages</p>
          </div>
        ))}
      </div>
    </>
  )
}
