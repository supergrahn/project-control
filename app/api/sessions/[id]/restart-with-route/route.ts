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

  const newProvider = getProvider(db, body.providerId)
  if (!newProvider) return NextResponse.json({ error: 'provider not found' }, { status: 404 })

  // 1. Mark the failed decision as transient_error (does not affect success rate).
  const failed = db
    .prepare('SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as { id: string } | undefined
  if (failed) recordOutcome(db, { decisionId: failed.id, outcome: 'transient_error' })

  // 2. Write a fresh routing_decisions row for the user's pick (no scoring — explicit choice).
  const decisionId = randomUUID()
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decisionId, sessionId, session.task_id, body.providerId, session.phase, 'normal',
    JSON.stringify({ source: 'manual_retry', providerId: body.providerId }), new Date().toISOString(),
  )

  // 3. Flip status back to active and respawn.
  db.prepare(`UPDATE sessions SET status = 'active' WHERE id = ?`).run(sessionId)
  await respawnSessionWithProvider(sessionId, body.providerId)

  return NextResponse.json({ ok: true, decisionId })
}
