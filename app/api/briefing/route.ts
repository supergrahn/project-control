// app/api/briefing/route.ts
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getOpenNextActions } from '@/lib/briefing/openNextActions'
import { getCriticFlagged } from '@/lib/briefing/criticFlagged'
import { getTopTasks } from '@/lib/briefing/topTasks'
import { getRecentFailures } from '@/lib/briefing/recentFailures'
import { getDuplicateTasks } from '@/lib/briefing/duplicateTasks'
import type { Briefing } from '@/lib/briefing/types'

export async function GET(): Promise<NextResponse> {
  const db = getDb()
  function tryResolve<T>(fn: () => T): Promise<T> {
    try { return Promise.resolve(fn()) } catch (e) { return Promise.reject(e) }
  }

  const settled = await Promise.allSettled([
    tryResolve(() => getOpenNextActions(db)),
    tryResolve(() => getCriticFlagged(db)),
    tryResolve(() => getTopTasks(db)),
    tryResolve(() => getRecentFailures(db)),
    tryResolve(() => getDuplicateTasks(db)),
  ])
  const briefing: Briefing = {
    openNextActions: settled[0].status === 'fulfilled' ? settled[0].value : [],
    criticFlagged: settled[1].status === 'fulfilled' ? settled[1].value : [],
    topTasks: settled[2].status === 'fulfilled' ? settled[2].value : [],
    recentFailures: settled[3].status === 'fulfilled' ? settled[3].value : [],
    duplicateTasks: settled[4].status === 'fulfilled' ? settled[4].value : [],
    generatedAt: new Date().toISOString(),
  }
  return NextResponse.json(briefing)
}
