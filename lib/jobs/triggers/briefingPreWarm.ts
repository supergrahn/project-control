import type { Database } from 'better-sqlite3'
import { enqueueJob } from '../runner'

export function briefingPreWarmTrigger(db: Database): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return

  const hour = new Date().getHours()
  if (hour < 5 || hour > 6) return

  const today = new Date().toISOString().slice(0, 10)
  const projects = db.prepare(`SELECT id FROM projects`).all() as Array<{ id: string }>
  const scopes = ['__all__', ...projects.map(p => p.id)]

  for (const scope of scopes) {
    const snap = db.prepare(`SELECT generated_at FROM briefing_snapshots WHERE scope_key = ?`)
      .get(scope) as { generated_at: string } | undefined
    if (snap && snap.generated_at.slice(0, 10) === today) continue
    enqueueJob(db, 'briefing_synthesize', { scope }, { dedupKey: `briefing_synthesize:${scope}:${today}` })
  }
}
