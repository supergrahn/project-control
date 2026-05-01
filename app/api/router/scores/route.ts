import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { listScores } from '@/lib/router'

// Returns the full routing_scores table for the debug grid. Not env-gated:
// the table contains aggregate (phase, complexity, provider) success rates,
// not user data, and the only mutating endpoint (reset-learning) IS gated.
export async function GET() {
  return NextResponse.json({ scores: listScores(getDb()) })
}
