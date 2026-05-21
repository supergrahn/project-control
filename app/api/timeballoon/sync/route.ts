// POST /api/timeballoon/sync
// Accepts a batch of outbox events from the Mac and applies them to the
// timeballoon_* mirror tables. Idempotent on each event's `uuid` — the Mac
// retries failed batches, so the same event can arrive multiple times.
//
// Request body (one object or an array):
//   {
//     uuid: "<outbox event uuid>",       // idempotency key
//     op:   "upsert" | "delete",
//     table: "daily_timesheet" | "project_aliases" | ...,
//     row_uuid: "<row's uuid>",
//     payload: { ...full row, including uuid + updated_at... } | {}
//   }
//
// Response:
//   200 { applied: N, skipped_duplicate: N, skipped_stale: N, errors: [...] }

import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireToken } from '@/lib/timeballoon-auth'
import {
  TimeBalloonTable,
  upsertTimesheetRow,
  upsertProjectAlias,
  upsertKnownProject,
  upsertRowFeedback,
  upsertGapHint,
  markDeleted,
  isOutboxSeen,
  markOutboxSeen,
} from '@/lib/db/timeballoonRows'
import { broadcastTimeballoon } from '@/lib/timeballoon-sync-bus'

type Event = {
  uuid: string
  op: 'upsert' | 'delete'
  table: TimeBalloonTable
  row_uuid: string
  payload: Record<string, unknown>
}

const VALID_TABLES: TimeBalloonTable[] = [
  'daily_timesheet',
  'project_aliases',
  'known_projects',
  'row_feedback',
  'gap_hints',
]

function applyUpsert(
  db: ReturnType<typeof getDb>,
  table: TimeBalloonTable,
  payload: Record<string, unknown>,
): 'applied' | 'skipped_stale' {
  switch (table) {
    case 'daily_timesheet': return upsertTimesheetRow(db, payload)
    case 'project_aliases': return upsertProjectAlias(db, payload)
    case 'known_projects': return upsertKnownProject(db, payload)
    case 'row_feedback': return upsertRowFeedback(db, payload)
    case 'gap_hints': return upsertGapHint(db, payload)
  }
}

export async function POST(req: NextRequest) {
  const authError = requireToken(req)
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const events: unknown[] = Array.isArray(body) ? body : [body]
  const db = getDb()
  let applied = 0
  let skippedDuplicate = 0
  let skippedStale = 0
  const errors: { uuid: string; error: string }[] = []
  const broadcastQueue: { table: TimeBalloonTable; row_uuid: string; op: string }[] = []

  for (const raw of events) {
    const ev = raw as Partial<Event>
    if (!ev.uuid || !ev.op || !ev.table || !ev.row_uuid) {
      errors.push({ uuid: String(ev.uuid ?? '?'), error: 'missing required field (uuid, op, table, row_uuid)' })
      continue
    }
    if (!VALID_TABLES.includes(ev.table as TimeBalloonTable)) {
      errors.push({ uuid: ev.uuid, error: `unknown table: ${ev.table}` })
      continue
    }
    // Idempotency: same outbox uuid arriving twice is a no-op.
    if (isOutboxSeen(db, ev.uuid)) {
      skippedDuplicate++
      continue
    }
    try {
      let outcome: 'applied' | 'skipped_stale' | 'noop' = 'noop'
      if (ev.op === 'upsert') {
        outcome = applyUpsert(db, ev.table as TimeBalloonTable, ev.payload ?? {})
      } else if (ev.op === 'delete') {
        outcome = markDeleted(db, ev.table as TimeBalloonTable, ev.row_uuid)
      } else {
        errors.push({ uuid: ev.uuid, error: `unknown op: ${ev.op}` })
        continue
      }
      markOutboxSeen(db, ev.uuid)
      if (outcome === 'applied') {
        applied++
        broadcastQueue.push({ table: ev.table as TimeBalloonTable, row_uuid: ev.row_uuid, op: ev.op })
      } else if (outcome === 'skipped_stale') {
        skippedStale++
      }
    } catch (e) {
      errors.push({ uuid: ev.uuid, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // Broadcast AFTER the DB writes commit so other clients don't race to refetch
  // before the row is durable. Sent one message per event so the Mac's WS
  // dispatcher can apply LWW per-row without grouping logic.
  for (const b of broadcastQueue) {
    broadcastTimeballoon({
      type: `${b.table}.${b.op === 'delete' ? 'deleted' : 'updated'}`,
      table: b.table,
      row_uuid: b.row_uuid,
      ts: new Date().toISOString(),
    })
  }

  return NextResponse.json({
    applied,
    skipped_duplicate: skippedDuplicate,
    skipped_stale: skippedStale,
    errors,
  })
}
