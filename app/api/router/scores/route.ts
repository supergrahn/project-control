import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Returns the full routing_scores table for the debug grid. Not env-gated:
// the table contains aggregate (phase, complexity, provider) success rates,
// not user data, and the only mutating endpoint (reset-learning) IS gated.
export async function GET() {
  const rows = getDb()
    .prepare(
      'SELECT phase, complexity, provider_id, n_outcomes, success_rate, updated_at FROM routing_scores ORDER BY phase, complexity, provider_id',
    )
    .all()
  return NextResponse.json({ scores: rows })
}
