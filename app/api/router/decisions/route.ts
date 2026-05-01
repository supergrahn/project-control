import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const sessionId = url.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

  const row = getDb()
    .prepare('SELECT * FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(sessionId) as Record<string, unknown> | undefined

  if (!row) return NextResponse.json({ decision: null })

  return NextResponse.json({
    decision: {
      ...row,
      score_breakdown: JSON.parse(row.score_breakdown as string),
    },
  })
}
