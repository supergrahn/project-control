// Mirror tables for TimeBalloon (the macOS time-tracker that POSTs to
// /api/timeballoon/sync). UUIDs are 32 hex chars generated on the Mac. Every
// table has updated_at (for GET /state?since=…) and is_deleted (tombstone).
//
// Apply semantics: last-write-wins on updated_at. If an incoming payload's
// updated_at is older than the local row's, we drop it — Phase 4's
// reconciliation re-sends fresher data the other way.

import type { Database } from 'better-sqlite3'

export type TimeBalloonTable =
  | 'daily_timesheet'
  | 'project_aliases'
  | 'known_projects'
  | 'row_feedback'
  | 'gap_hints'

const TABLE_TO_PHYSICAL: Record<TimeBalloonTable, string> = {
  daily_timesheet: 'timeballoon_daily_timesheet',
  project_aliases: 'timeballoon_project_aliases',
  known_projects: 'timeballoon_known_projects',
  row_feedback: 'timeballoon_row_feedback',
  gap_hints: 'timeballoon_gap_hints',
}

export function physicalTable(logical: TimeBalloonTable): string {
  return TABLE_TO_PHYSICAL[logical]
}

/**
 * Returns true if the incoming row should be applied — i.e. either the row
 * doesn't exist yet, or its existing updated_at is older. Used to short-circuit
 * stale upserts (LWW).
 */
function shouldApply(
  db: Database,
  table: string,
  uuid: string,
  incomingUpdatedAt: string,
): boolean {
  const existing = db
    .prepare(`SELECT updated_at FROM ${table} WHERE uuid = ?`)
    .get(uuid) as { updated_at: string } | undefined
  if (!existing) return true
  return incomingUpdatedAt > existing.updated_at
}

type Payload = Record<string, unknown>

function assertString(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`field '${field}' must be string, got ${typeof v}`)
  return v
}

function asStringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') throw new Error(`expected string|null, got ${typeof v}`)
  return v
}

function asNumber(v: unknown, field: string): number {
  if (typeof v !== 'number') throw new Error(`field '${field}' must be number, got ${typeof v}`)
  return v
}

function asNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'number') throw new Error(`expected number|null, got ${typeof v}`)
  return v
}

// --- upsert helpers (one per table) ---
// Each takes the payload that the Mac built via SQLite json_object() in
// src-tauri/src/db.rs::json_object_sql, so keys mirror the Mac's column names.

export function upsertTimesheetRow(db: Database, p: Payload): 'applied' | 'skipped_stale' {
  const uuid = assertString(p.uuid, 'uuid')
  const updatedAt = assertString(p.updated_at, 'updated_at')
  if (!shouldApply(db, 'timeballoon_daily_timesheet', uuid, updatedAt)) return 'skipped_stale'
  db.prepare(`
    INSERT INTO timeballoon_daily_timesheet
      (uuid, date, signature, project, work_type, total_seconds, description,
       status, confidence, task_ref, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(uuid) DO UPDATE SET
      date = excluded.date, signature = excluded.signature,
      project = excluded.project, work_type = excluded.work_type,
      total_seconds = excluded.total_seconds, description = excluded.description,
      status = excluded.status, confidence = excluded.confidence,
      task_ref = excluded.task_ref, updated_at = excluded.updated_at,
      is_deleted = 0
  `).run(
    uuid,
    assertString(p.date, 'date'),
    assertString(p.signature, 'signature'),
    assertString(p.project, 'project'),
    assertString(p.work_type, 'work_type'),
    asNumber(p.total_seconds, 'total_seconds'),
    assertString(p.description, 'description'),
    assertString(p.status, 'status'),
    asNumberOrNull(p.confidence),
    asStringOrNull(p.task_ref),
    updatedAt,
  )
  return 'applied'
}

export function upsertProjectAlias(db: Database, p: Payload): 'applied' | 'skipped_stale' {
  const uuid = assertString(p.uuid, 'uuid')
  // Aliases lack updated_at in the Mac schema today; reuse last_used as the
  // freshness signal. Identical semantics — last_used updates on every upsert.
  const updatedAt = assertString(p.last_used, 'last_used')
  if (!shouldApply(db, 'timeballoon_project_aliases', uuid, updatedAt)) return 'skipped_stale'
  db.prepare(`
    INSERT INTO timeballoon_project_aliases
      (uuid, signature, marathon_project, marathon_work_type, last_used, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(uuid) DO UPDATE SET
      signature = excluded.signature,
      marathon_project = excluded.marathon_project,
      marathon_work_type = excluded.marathon_work_type,
      last_used = excluded.last_used,
      updated_at = excluded.updated_at,
      is_deleted = 0
  `).run(
    uuid,
    assertString(p.signature, 'signature'),
    assertString(p.marathon_project, 'marathon_project'),
    assertString(p.marathon_work_type, 'marathon_work_type'),
    updatedAt,
    updatedAt,
  )
  return 'applied'
}

export function upsertKnownProject(db: Database, p: Payload): 'applied' | 'skipped_stale' {
  const uuid = assertString(p.uuid, 'uuid')
  const updatedAt = assertString(p.updated_at, 'updated_at')
  if (!shouldApply(db, 'timeballoon_known_projects', uuid, updatedAt)) return 'skipped_stale'
  db.prepare(`
    INSERT INTO timeballoon_known_projects
      (uuid, name, keywords, work_type, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(uuid) DO UPDATE SET
      name = excluded.name, keywords = excluded.keywords,
      work_type = excluded.work_type, updated_at = excluded.updated_at,
      is_deleted = 0
  `).run(
    uuid,
    assertString(p.name, 'name'),
    typeof p.keywords === 'string' ? p.keywords : '',
    asStringOrNull(p.work_type),
    updatedAt,
  )
  return 'applied'
}

export function upsertRowFeedback(db: Database, p: Payload): 'applied' | 'skipped_stale' {
  const uuid = assertString(p.uuid, 'uuid')
  // row_feedback has no updated_at on the Mac; use created_at.
  const updatedAt = assertString(p.created_at, 'created_at')
  if (!shouldApply(db, 'timeballoon_row_feedback', uuid, updatedAt)) return 'skipped_stale'
  // The Mac sends timesheet_row_id (local int). We don't have the matching
  // row's uuid at the time the event arrives; payload should ideally carry
  // it. For Phase 2 we accept either field — the Mac's emit path will be
  // taught to include timesheet_row_uuid in Phase 3.
  const rowUuid = (typeof p.timesheet_row_uuid === 'string' && p.timesheet_row_uuid)
    ? p.timesheet_row_uuid
    : String(p.timesheet_row_id ?? '')
  db.prepare(`
    INSERT INTO timeballoon_row_feedback
      (uuid, timesheet_row_uuid, score, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, 0)
    ON CONFLICT(uuid) DO UPDATE SET
      timesheet_row_uuid = excluded.timesheet_row_uuid,
      score = excluded.score, created_at = excluded.created_at,
      updated_at = excluded.updated_at, is_deleted = 0
  `).run(uuid, rowUuid, asNumber(p.score, 'score'), updatedAt, updatedAt)
  return 'applied'
}

export function upsertGapHint(db: Database, p: Payload): 'applied' | 'skipped_stale' {
  const uuid = assertString(p.uuid, 'uuid')
  const updatedAt = assertString(p.last_picked, 'last_picked')
  if (!shouldApply(db, 'timeballoon_gap_hints', uuid, updatedAt)) return 'skipped_stale'
  db.prepare(`
    INSERT INTO timeballoon_gap_hints
      (uuid, hour_of_day, label, category, picked_count, last_picked, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(uuid) DO UPDATE SET
      hour_of_day = excluded.hour_of_day, label = excluded.label,
      category = excluded.category, picked_count = excluded.picked_count,
      last_picked = excluded.last_picked, updated_at = excluded.updated_at,
      is_deleted = 0
  `).run(
    uuid,
    asNumber(p.hour_of_day, 'hour_of_day'),
    assertString(p.label, 'label'),
    assertString(p.category, 'category'),
    asNumber(p.picked_count, 'picked_count'),
    updatedAt,
    updatedAt,
  )
  return 'applied'
}

/**
 * Soft-delete by uuid. Sets is_deleted=1 and bumps updated_at so the
 * tombstone propagates via GET /state?since=… to other clients. We never
 * hard-delete because other devices that haven't synced yet must still see
 * the tombstone before the row is forgotten.
 */
export function markDeleted(
  db: Database,
  table: TimeBalloonTable,
  uuid: string,
): 'applied' | 'noop' {
  const physical = physicalTable(table)
  const now = new Date().toISOString()
  const result = db
    .prepare(`UPDATE ${physical} SET is_deleted = 1, updated_at = ? WHERE uuid = ? AND is_deleted = 0`)
    .run(now, uuid)
  return result.changes > 0 ? 'applied' : 'noop'
}

/**
 * Idempotency check: returns true if we've already processed an outbox event
 * with this uuid. Recorded by markOutboxSeen after a successful apply.
 */
export function isOutboxSeen(db: Database, outboxUuid: string): boolean {
  const row = db
    .prepare('SELECT 1 FROM timeballoon_outbox_seen WHERE outbox_uuid = ?')
    .get(outboxUuid)
  return !!row
}

export function markOutboxSeen(db: Database, outboxUuid: string): void {
  db.prepare(`
    INSERT OR IGNORE INTO timeballoon_outbox_seen (outbox_uuid, received_at)
    VALUES (?, ?)
  `).run(outboxUuid, new Date().toISOString())
}

/** State snapshot for reconciliation. Returns rows changed since `sinceIso`. */
export function getStateSince(
  db: Database,
  sinceIso: string,
): Record<TimeBalloonTable, unknown[]> {
  const out: Record<TimeBalloonTable, unknown[]> = {
    daily_timesheet: [],
    project_aliases: [],
    known_projects: [],
    row_feedback: [],
    gap_hints: [],
  }
  for (const [logical, physical] of Object.entries(TABLE_TO_PHYSICAL) as [
    TimeBalloonTable,
    string,
  ][]) {
    out[logical] = db
      .prepare(`SELECT * FROM ${physical} WHERE updated_at > ? ORDER BY updated_at ASC`)
      .all(sinceIso) as unknown[]
  }
  return out
}
