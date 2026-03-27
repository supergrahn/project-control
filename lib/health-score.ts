import type { DashboardResponse } from './dashboard'

export type ProjectScore = {
  projectId: string
  projectName: string
  score: number
  breakdown: {
    audit: number
    pipeline: number
    freshness: number
    sessions: number
    memory: number
  }
}

export function calculateProjectScores(
  data: DashboardResponse,
  projectMemoryStatus: Map<string, boolean> // projectId -> has memory files
): ProjectScore[] {
  // Group data by project
  const projectMap = new Map<string, {
    ideas: number; specs: number; plans: number
    blockers: number; warnings: number; clean: number; unaudited: number
    hasActiveSession: boolean; recentlyTouched: boolean
    hasMemory: boolean
    projectName: string
  }>()

  // Seed from upNext
  for (const item of data.upNext) {
    if (!projectMap.has(item.projectId)) {
      projectMap.set(item.projectId, {
        ideas: 0, specs: 0, plans: 0,
        blockers: 0, warnings: 0, clean: 0, unaudited: 0,
        hasActiveSession: false, recentlyTouched: false,
        hasMemory: projectMemoryStatus.get(item.projectId) ?? false,
        projectName: item.projectName,
      })
    }
    const p = projectMap.get(item.projectId)!
    if (item.stage === 'spec') p.ideas++
    else if (item.stage === 'plan') p.specs++
    else if (item.stage === 'develop') {
      p.plans++
      if (item.auditStatus === 'blockers') p.blockers++
      else if (item.auditStatus === 'warnings') p.warnings++
      else if (item.auditStatus === 'clean') p.clean++
      else p.unaudited++
    }
  }

  for (const item of data.inProgress) {
    if (!projectMap.has(item.projectId)) {
      projectMap.set(item.projectId, {
        ideas: 0, specs: 0, plans: 0,
        blockers: 0, warnings: 0, clean: 0, unaudited: 0,
        hasActiveSession: true, recentlyTouched: true,
        hasMemory: projectMemoryStatus.get(item.projectId) ?? false,
        projectName: item.projectName,
      })
    } else {
      projectMap.get(item.projectId)!.hasActiveSession = true
      projectMap.get(item.projectId)!.recentlyTouched = true
    }
  }

  for (const item of data.recentlyTouched) {
    const now = Date.now()
    const touched = new Date(item.modifiedAt).getTime()
    if (now - touched < 7 * 24 * 60 * 60 * 1000) {
      if (projectMap.has(item.projectId)) {
        projectMap.get(item.projectId)!.recentlyTouched = true
      }
    }
  }

  const scores: ProjectScore[] = []

  for (const [projectId, p] of projectMap) {
    // Audit (30 points)
    const totalAudited = p.blockers + p.warnings + p.clean
    let audit = 0
    if (totalAudited > 0) {
      const cleanRatio = p.clean / totalAudited
      audit = Math.round(cleanRatio * 30)
    } else if (p.plans === 0) {
      audit = 30 // no plans = no audit needed
    }

    // Pipeline progress (25 points)
    const totalFeatures = p.ideas + p.specs + p.plans
    const pipeline = totalFeatures > 0 ? Math.round((p.plans / totalFeatures) * 25) : 25

    // Freshness (20 points)
    const freshness = p.hasActiveSession ? 20 : p.recentlyTouched ? 10 : 0

    // Session activity (15 points)
    const sessions = p.hasActiveSession ? 15 : p.recentlyTouched ? 8 : 0

    // Memory coverage (10 points)
    const memory = p.hasMemory ? 10 : 0

    const score = audit + pipeline + freshness + sessions + memory

    scores.push({
      projectId,
      projectName: p.projectName,
      score,
      breakdown: { audit, pipeline, freshness, sessions, memory },
    })
  }

  scores.sort((a, b) => b.score - a.score)
  return scores
}
