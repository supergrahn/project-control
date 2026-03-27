import type { Session } from './db'

export type UsageReport = {
  period: string
  totalSessions: number
  totalDuration: number
  byProject: Array<{ projectName: string; sessions: number; duration: number }>
  byPhase: Array<{ phase: string; sessions: number; duration: number }>
  dailyBreakdown: Array<{ date: string; sessions: number; duration: number }>
}

export function calculateUsage(sessions: Session[], projects: Map<string, string>, periodDays: number = 7): UsageReport {
  const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000)
  const filtered = sessions.filter(s => new Date(s.created_at) > cutoff)

  let totalDuration = 0
  const byProjectMap = new Map<string, { sessions: number; duration: number }>()
  const byPhaseMap = new Map<string, { sessions: number; duration: number }>()
  const dailyMap = new Map<string, { sessions: number; duration: number }>()

  for (const s of filtered) {
    const start = new Date(s.created_at).getTime()
    const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now()
    const duration = Math.round((end - start) / 60000) // minutes

    totalDuration += duration

    const projectName = projects.get(s.project_id) ?? 'Unknown'
    const bp = byProjectMap.get(projectName) ?? { sessions: 0, duration: 0 }
    bp.sessions++; bp.duration += duration
    byProjectMap.set(projectName, bp)

    const bph = byPhaseMap.get(s.phase) ?? { sessions: 0, duration: 0 }
    bph.sessions++; bph.duration += duration
    byPhaseMap.set(s.phase, bph)

    const date = s.created_at.slice(0, 10)
    const bd = dailyMap.get(date) ?? { sessions: 0, duration: 0 }
    bd.sessions++; bd.duration += duration
    dailyMap.set(date, bd)
  }

  return {
    period: `${periodDays}d`,
    totalSessions: filtered.length,
    totalDuration,
    byProject: Array.from(byProjectMap, ([projectName, v]) => ({ projectName, ...v })).sort((a, b) => b.duration - a.duration),
    byPhase: Array.from(byPhaseMap, ([phase, v]) => ({ phase, ...v })).sort((a, b) => b.sessions - a.sessions),
    dailyBreakdown: Array.from(dailyMap, ([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
  }
}
