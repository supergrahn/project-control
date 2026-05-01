import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Destructive: wipes all observed-outcome learning state and returns the
// router to its hand-coded defaults for every (phase, complexity, provider)
// cell. Gated behind ENABLE_DEBUG_PAGES so a stray click on a public
// deployment cannot reset the learning history. routing_decisions is
// preserved as an audit log; only the learning state is wiped.
export async function POST() {
  if (process.env.ENABLE_DEBUG_PAGES !== '1') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM routing_outcomes').run()
    db.prepare('DELETE FROM routing_scores').run()
  })()
  return NextResponse.json({ ok: true })
}
