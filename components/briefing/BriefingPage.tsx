'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { useBriefing } from '@/hooks/useBriefing'
import type { BriefingCriticFlag, BriefingDuplicate } from '@/lib/briefing/types'
import { ProjectPicker } from './ProjectPicker'
import { BriefingHero } from './BriefingHero'
import { OpenNextActionsSection } from './sections/OpenNextActionsSection'
import { CriticFlaggedSection } from './sections/CriticFlaggedSection'
import { TopTasksSection } from './sections/TopTasksSection'
import { RecentFailuresSection } from './sections/RecentFailuresSection'
import { DuplicateTasksSection } from './sections/DuplicateTasksSection'

export function BriefingPage() {
  const router = useRouter()
  const params = useSearchParams()
  const projectId = params.get('projectId') ?? undefined
  const { data, isLoading, error, mutate } = useBriefing(projectId)

  async function handleContinue(sessionId: string) {
    const res = await fetch(`/api/sessions/${sessionId}/continue`, { method: 'POST' })
    const body = await res.json()
    if (res.ok) router.push(`/sessions?selected=${body.sessionId}`)
  }

  async function handleFix(item: BriefingCriticFlag) {
    const res = await fetch(`/api/critic-findings/${item.findingId}/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: item.category, message: item.message, severity: item.severity }),
    })
    const body = await res.json()
    if (res.ok) router.push(`/sessions?selected=${body.sessionId}`)
  }

  async function handleStart(taskId: string) {
    const res = await fetch(`/api/tasks/${taskId}/start`, { method: 'POST' })
    const body = await res.json()
    if (res.ok) router.push(`/sessions?selected=${body.sessionId}`)
  }

  async function handleDismiss(item: BriefingDuplicate) {
    await fetch(`/api/dedup-dismissals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: item.projectId, aTaskId: item.aTaskId, bTaskId: item.bTaskId }),
    })
    await mutate()
  }

  async function handleRefresh() {
    const url = projectId ? `/api/briefing/refresh?scope=${encodeURIComponent(projectId)}` : '/api/briefing/refresh'
    await fetch(url, { method: 'POST' })
    await mutate()
  }

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
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <LayoutDashboard size={18} className="text-accent-blue" /> Briefing
          </h1>
          <ProjectPicker />
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          What needs attention now — aggregated from sessions, specs, plans, and tasks across all projects.
        </p>
      </div>

      <BriefingHero data={data} onRefresh={handleRefresh} />

      {totalSignal === 0 && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <LayoutDashboard size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">All clear</p>
          <p className="text-text-muted text-xs mt-1">Nothing flagged. Background workflow will surface signal here as it runs.</p>
        </div>
      )}

      {totalSignal > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <OpenNextActionsSection items={data.openNextActions} onAction={handleContinue} />
          <CriticFlaggedSection items={data.criticFlagged} onAction={handleFix} />
          <TopTasksSection items={data.topTasks} onAction={handleStart} />
          <RecentFailuresSection items={data.recentFailures} onAction={handleContinue} />
          <DuplicateTasksSection items={data.duplicateTasks} onAction={handleDismiss} />
        </div>
      )}
    </>
  )
}
