// app/api/briefing/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { enqueueJob } from '@/lib/jobs/runner'
import { getOpenNextActions } from '@/lib/briefing/openNextActions'
import { getCriticFlagged } from '@/lib/briefing/criticFlagged'
import { getTopTasks } from '@/lib/briefing/topTasks'
import { getRecentFailures } from '@/lib/briefing/recentFailures'
import { getDuplicateTasks } from '@/lib/briefing/duplicateTasks'
import { sectionSignature } from '@/lib/briefing/sectionSignature'
import type { BriefingResponse } from '@/lib/briefing/types'

const STALE_HOURS = 18

function tryResolve<T>(fn: () => T): Promise<T> {
  try { return Promise.resolve(fn()) } catch (err) { return Promise.reject(err) }
}

export async function GET(req: Request): Promise<NextResponse<BriefingResponse>> {
  const url = new URL(req.url)
  const rawScope = url.searchParams.get('projectId')
  const scope = !rawScope || rawScope === '__all__' ? '__all__' : rawScope
  const projectId = scope === '__all__' ? undefined : scope

  const db = getDb()
  const settled = await Promise.allSettled([
    tryResolve(() => getOpenNextActions(db, { projectId })),
    tryResolve(() => getCriticFlagged(db, { projectId })),
    tryResolve(() => getTopTasks(db, { projectId })),
    tryResolve(() => getRecentFailures(db, { projectId })),
    tryResolve(() => getDuplicateTasks(db, { projectId })),
  ])

  const sections = {
    openNextActions: settled[0].status === 'fulfilled' ? settled[0].value : [],
    criticFlagged: settled[1].status === 'fulfilled' ? settled[1].value : [],
    topTasks: settled[2].status === 'fulfilled' ? settled[2].value : [],
    recentFailures: settled[3].status === 'fulfilled' ? settled[3].value : [],
    duplicateTasks: settled[4].status === 'fulfilled' ? settled[4].value : [],
  }

  const snap = db.prepare(
    `SELECT narrative, priority_actions, model, generated_at, section_signature FROM briefing_snapshots WHERE scope_key = ?`
  ).get(scope) as { narrative: string; priority_actions: string; model: string; generated_at: string; section_signature: string } | undefined

  const now = Date.now()
  const currentSignature = sectionSignature(sections)
  let snapshotStale = true
  if (snap) {
    const ageHours = (now - new Date(snap.generated_at).getTime()) / 3_600_000
    const drifted = snap.section_signature !== currentSignature
    snapshotStale = ageHours > STALE_HOURS || drifted
  }

  if (snapshotStale) {
    const today = new Date().toISOString().slice(0, 10)
    enqueueJob(db, 'briefing_synthesize', { scope }, { dedupKey: `briefing_synthesize:${scope}:${today}` })
  }

  let priorityActions: Array<{ sectionKey: string; refId: string; reason: string }> = []
  if (snap) {
    try { priorityActions = JSON.parse(snap.priority_actions) } catch { priorityActions = [] }
  }

  const snapshot = snap ? {
    narrative: snap.narrative,
    priorityActions,
    model: snap.model,
    generatedAt: snap.generated_at,
  } : null

  return NextResponse.json({
    ...sections,
    generatedAt: new Date().toISOString(),
    snapshot,
    snapshotStale,
  })
}
