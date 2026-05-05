import os from 'os'
import type { Database } from 'better-sqlite3'

export type JobKind =
  | 'embed'
  | 'grade_session'
  | 'extract_next_actions'
  | 'critique_spec'
  | 'critique_plan'
  | 'refresh_prep'
  | 'briefing_synthesize'

export type JobHandler = (db: Database, payload: unknown) => Promise<void>

const handlers = new Map<JobKind, JobHandler>()

export function registerHandler(kind: JobKind, handler: JobHandler): void {
  handlers.set(kind, handler)
}

export function clearHandlers(): void {
  handlers.clear()
}

export function enqueueJob(
  db: Database,
  kind: JobKind,
  payload: unknown,
  opts?: { dedupKey?: string },
): void {
  if (opts?.dedupKey) {
    const existing = db.prepare(
      `SELECT 1 FROM pending_jobs WHERE dedup_key = ? AND state = 'pending' LIMIT 1`
    ).get(opts.dedupKey)
    if (existing) return
  }
  db.prepare(
    `INSERT INTO pending_jobs (kind, payload, dedup_key, state, scheduled_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).run(kind, JSON.stringify(payload), opts?.dedupKey ?? null, new Date().toISOString())
}

export async function runOneBatch(
  db: Database,
  opts: { batchSize: number; loadAverageMax: number },
): Promise<{ ran: number; skipped: 'idle' | 'none' }> {
  const load = os.loadavg()[0]
  if (load > opts.loadAverageMax) return { ran: 0, skipped: 'idle' }

  const now = new Date().toISOString()

  // Atomic claim: select + UPDATE wrapped in a transaction with a state='pending'
  // guard in the WHERE so two overlapping ticks can't double-claim the same row.
  const claimed = db.transaction(() => {
    const rows = db.prepare(
      `SELECT id, kind, payload, attempts FROM pending_jobs
       WHERE state = 'pending' AND scheduled_at <= ?
       ORDER BY scheduled_at ASC LIMIT ?`
    ).all(now, opts.batchSize) as Array<{ id: number; kind: JobKind; payload: string; attempts: number }>
    if (rows.length === 0) return []
    const ids = rows.map(c => c.id)
    const placeholders = ids.map(() => '?').join(',')
    const result = db.prepare(
      `UPDATE pending_jobs SET state = 'running', started_at = ?
       WHERE id IN (${placeholders}) AND state = 'pending'`
    ).run(now, ...ids)
    // If any row was already claimed by a parallel transaction, drop it from this batch.
    if (result.changes !== rows.length) {
      const stillRunning = db.prepare(
        `SELECT id FROM pending_jobs WHERE id IN (${placeholders}) AND state = 'running' AND started_at = ?`
      ).all(...ids, now) as Array<{ id: number }>
      const claimedSet = new Set(stillRunning.map(r => r.id))
      return rows.filter(r => claimedSet.has(r.id))
    }
    return rows
  })()

  if (claimed.length === 0) return { ran: 0, skipped: 'none' }

  // Dispatch in parallel
  await Promise.all(claimed.map(async (job) => {
    const handler = handlers.get(job.kind)
    if (!handler) {
      db.prepare(`UPDATE pending_jobs SET state = 'failed', last_error = ?, finished_at = ? WHERE id = ?`)
        .run(`no handler registered for kind '${job.kind}'`, new Date().toISOString(), job.id)
      return
    }
    try {
      const payload = JSON.parse(job.payload)
      await handler(db, payload)
      db.prepare(`UPDATE pending_jobs SET state = 'done', finished_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), job.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const newAttempts = job.attempts + 1
      if (newAttempts >= 3) {
        db.prepare(`UPDATE pending_jobs SET state = 'failed', attempts = ?, last_error = ?, finished_at = ? WHERE id = ?`)
          .run(newAttempts, msg, new Date().toISOString(), job.id)
        console.warn(`[jobs] parked ${job.kind} #${job.id} after 3 attempts: ${msg}`)
      } else {
        const backoffMs = 60_000 * Math.pow(2, newAttempts - 1)
        const next = new Date(Date.now() + backoffMs).toISOString()
        db.prepare(`UPDATE pending_jobs SET state = 'pending', attempts = ?, last_error = ?, scheduled_at = ?, started_at = NULL WHERE id = ?`)
          .run(newAttempts, msg, next, job.id)
        console.warn(`[jobs] retry ${job.kind} #${job.id} in ${backoffMs}ms: ${msg}`)
      }
    }
  }))

  return { ran: claimed.length, skipped: 'none' }
}

export function startScheduler(opts: { intervalMs: number; batchSize: number; loadAverageMax: number; getDb: () => Database }): { stop: () => void } {
  let stopped = false
  const tick = async () => {
    if (stopped) return
    try {
      await runOneBatch(opts.getDb(), { batchSize: opts.batchSize, loadAverageMax: opts.loadAverageMax })
    } catch (err) {
      console.warn('[jobs] tick error:', err)
    }
  }
  const handle = setInterval(tick, opts.intervalMs)
  return {
    stop: () => {
      stopped = true
      clearInterval(handle)
    },
  }
}
