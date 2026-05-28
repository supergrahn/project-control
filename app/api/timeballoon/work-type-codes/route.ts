// Work-type code catalogue admin (Spec O).
// GET    /api/timeballoon/work-type-codes        → list
// POST   /api/timeballoon/work-type-codes        → upsert { code, name, marathon_legacy_code? }
// These are bearer-auth'd like the rest of /api/timeballoon/*.

import { NextRequest, NextResponse } from 'next/server'
import { getDb, listWorkTypeCodes, upsertWorkTypeCode } from '@/lib/db'
import { requireToken } from '@/lib/timeballoon-auth'

export async function GET(req: NextRequest) {
  const authError = requireToken(req)
  if (authError) return authError
  return NextResponse.json(listWorkTypeCodes(getDb()))
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
  const { code, name, marathon_legacy_code } = body as {
    code?: string
    name?: string
    marathon_legacy_code?: string | null
  }
  if (!code?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 })
  }
  const db = getDb()
  upsertWorkTypeCode(db, { code, name, marathon_legacy_code: marathon_legacy_code ?? null })
  return NextResponse.json(listWorkTypeCodes(db), { status: 201 })
}
