import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { RoutingDecision } from '@/lib/router'

// Read-only inspection endpoint: returns the latest routing decision for a
// session so the "via router" badge popover (Task 16) can render the score
// breakdown without recomputing. Not gated — this is the same data the badge
// surfaces on every session card.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const row = getDb()
    .prepare('SELECT * FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as RoutingDecision | undefined

  if (!row) return NextResponse.json({ decision: null })

  return NextResponse.json({
    decision: {
      ...row,
      score_breakdown: JSON.parse(row.score_breakdown),
    },
  })
}
