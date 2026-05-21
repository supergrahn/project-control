// GET /api/timeballoon/state?since=<iso>
// Returns all rows changed since `since` across the timeballoon_* mirror tables.
// Used by the Mac on startup and on WS reconnect after a long disconnect to
// reconcile drift (rows the WS push channel might have dropped).
//
// Response shape:
//   {
//     daily_timesheet: [ { uuid, date, ..., updated_at, is_deleted } ],
//     project_aliases: [ ... ],
//     known_projects:  [ ... ],
//     row_feedback:    [ ... ],
//     gap_hints:       [ ... ],
//     served_at: "2026-05-21T10:23:00Z"   // canonical timestamp the Mac stores
//                                         // as its next `since` cursor
//   }

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireToken } from '@/lib/timeballoon-auth'
import { getStateSince } from '@/lib/db/timeballoonRows'

export async function GET(req: NextRequest) {
  const authError = requireToken(req)
  if (authError) return authError

  const since = req.nextUrl.searchParams.get('since') ?? '1970-01-01T00:00:00Z'
  // Cheap validation: ISO 8601 starts with YYYY-MM-DD. Anything else is a 400.
  if (!/^\d{4}-\d{2}-\d{2}/.test(since)) {
    return NextResponse.json({ error: 'since must be ISO 8601' }, { status: 400 })
  }

  const db = getDb()
  const state = getStateSince(db, since)
  return NextResponse.json({
    ...state,
    served_at: new Date().toISOString(),
  })
}
