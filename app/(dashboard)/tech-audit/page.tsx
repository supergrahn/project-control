'use client'
import { Package, AlertTriangle } from 'lucide-react'
import { useTechAudit } from '@/hooks/useTechAudit'

export default function TechAuditPage() {
  const { data, isLoading, isError } = useTechAudit()

  if (isLoading) return <p className="text-text-muted text-sm">Scanning projects...</p>
  if (isError || !data) return <p className="text-text-muted text-sm">Failed to scan.</p>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Package size={18} className="text-accent-blue" /> Tech Stack Audit
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            {data.projects.length} projects scanned · {data.drift.length} packages with version drift
          </p>
        </div>
      </div>

      {/* Drift table */}
      {data.drift.length > 0 && (
        <div className="rounded-lg border border-border-default overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-border-default bg-bg-primary/50 flex items-center gap-2">
            <AlertTriangle size={14} className="text-accent-orange" />
            <h2 className="text-sm font-semibold text-text-primary">Version Drift</h2>
          </div>
          <div className="divide-y divide-border-default/50">
            {data.drift.slice(0, 20).map(d => (
              <div key={d.package} className="px-4 py-2.5">
                <span className="text-sm font-mono text-text-primary">{d.package}</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {d.versions.map((v, i) => (
                    <span key={i} className="text-[10px] bg-bg-primary border border-border-default rounded px-2 py-0.5">
                      <span className="text-text-muted">{v.projectName}:</span> <span className="text-accent-orange">{v.version}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.drift.length === 0 && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center mb-6">
          <Package size={28} className="text-accent-green mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No version drift detected</p>
          <p className="text-text-muted text-xs mt-1">All shared packages use consistent versions.</p>
        </div>
      )}

      {/* Project summary */}
      <div className="grid grid-cols-3 gap-3">
        {data.projects.map(p => (
          <div key={p.projectId} className="bg-bg-primary border border-border-default rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-1">{p.projectName}</h3>
            <p className="text-xs text-text-muted">{p.packageCount} packages</p>
          </div>
        ))}
      </div>
    </>
  )
}
