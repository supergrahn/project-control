'use client'
import { LayoutDashboard } from 'lucide-react'
import { useBriefing } from '@/hooks/useBriefing'
import { OpenNextActionsSection } from './sections/OpenNextActionsSection'
import { CriticFlaggedSection } from './sections/CriticFlaggedSection'
import { TopTasksSection } from './sections/TopTasksSection'
import { RecentFailuresSection } from './sections/RecentFailuresSection'
import { DuplicateTasksSection } from './sections/DuplicateTasksSection'

export function BriefingPage() {
  const { data, isLoading, error } = useBriefing()

  if (isLoading) return <p className="text-text-muted text-sm">Loading…</p>
  if (error) return <p className="text-accent-red text-sm">Failed to load briefing.</p>
  if (!data) return null

  const totalSignal =
    data.openNextActions.length +
    data.criticFlagged.length +
    data.topTasks.length +
    data.recentFailures.length +
    data.duplicateTasks.length

  return (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <LayoutDashboard size={18} className="text-accent-blue" /> Briefing
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          What needs attention now — aggregated from sessions, specs, plans, and tasks across all projects.
        </p>
      </div>

      {totalSignal === 0 && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <LayoutDashboard size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">All clear</p>
          <p className="text-text-muted text-xs mt-1">Nothing flagged. Background workflow will surface signal here as it runs.</p>
        </div>
      )}

      {totalSignal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <OpenNextActionsSection items={data.openNextActions} />
          <CriticFlaggedSection items={data.criticFlagged} />
          <TopTasksSection items={data.topTasks} />
          <RecentFailuresSection items={data.recentFailures} />
          <DuplicateTasksSection items={data.duplicateTasks} />
        </div>
      )}
    </>
  )
}
