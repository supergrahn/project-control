// Same-origin admin route for the work-type code catalogue (no bearer).
// GET  → list ;  POST { code, name, marathon_legacy_code? } → upsert
import { NextResponse } from 'next/server'
import { getDb, listWorkTypeCodes, upsertWorkTypeCode } from '@/lib/db'

export function GET() {
  return NextResponse.json(listWorkTypeCodes(getDb()))
}

export async function POST(req: Request) {
  let body: { code?: string; name?: string; marathon_legacy_code?: string | null }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!body.code?.trim() || !body.name?.trim()) {
    return NextResponse.json({ error: 'code and name are required' }, { status: 400 })
  }
  const db = getDb()
  upsertWorkTypeCode(db, { code: body.code, name: body.name, marathon_legacy_code: body.marathon_legacy_code ?? null })
  return NextResponse.json(listWorkTypeCodes(db), { status: 201 })
}
