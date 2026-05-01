import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { getProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router'
import { respawnSessionWithProvider } from '@/lib/session-manager'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params
  const body = (await req.json().catch(() => null)) as { providerId?: string } | null
  if (!body?.providerId) return NextResponse.json({ error: 'providerId required' }, { status: 400 })

  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | { id: string; project_id: string; phase: string; task_id: string | null; status: string }
    | undefined
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })

  // Precondition: only sessions stuck in needs_route_retry should be respawned.
  // Reviving an ended session or duplicating an active one would corrupt routing
  // analytics with spurious manual_retry decisions and transient_error outcomes.
  if (session.status !== 'needs_route_retry') {
    return NextResponse.json(
      { error: `session is not awaiting retry (status: ${session.status})` },
      { status: 409 },
    )
  }

  const newProvider = getProvider(db, body.providerId)
  if (!newProvider) return NextResponse.json({ error: 'provider not found' }, { status: 404 })

  // Look up the failed decision once — we need both its id (for recordOutcome)
  // and its complexity (to copy forward to the manual_retry decision so analytics
  // grouped by complexity stay accurate).
  const failed = db
    .prepare('SELECT id, complexity FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as { id: string; complexity: string } | undefined

  const decisionId = randomUUID()
  const now = new Date().toISOString()
  const carriedComplexity = failed?.complexity ?? 'normal'

  // Wrap the three DB writes in a transaction so a crash mid-flight cannot
  // leave the session with a manual_retry decision but no transient_error
  // recorded against the failed one (or vice versa). The respawn call stays
  // OUTSIDE the transaction because it does adapter I/O.
  db.transaction(() => {
    if (failed) recordOutcome(db, { decisionId: failed.id, outcome: 'transient_error' })

    db.prepare(
      `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      decisionId, sessionId, session.task_id, body.providerId, session.phase, carriedComplexity,
      JSON.stringify({ source: 'manual_retry', providerId: body.providerId }), now,
    )

    db.prepare(`UPDATE sessions SET status = 'active' WHERE id = ?`).run(sessionId)
  })()

  await respawnSessionWithProvider(sessionId, body.providerId)

  return NextResponse.json({ ok: true, decisionId })
}
