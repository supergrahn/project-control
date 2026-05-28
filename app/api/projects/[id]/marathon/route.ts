// PATCH /api/projects/[id]/marathon — same-origin admin route (no bearer;
// protected by network like the rest of project-control's admin API).
// Body: { marathon_code?, marathon_account?, marathon_default_wt? }
import { NextResponse } from 'next/server'
import { getDb, getProject, setProjectMarathonFields } from '@/lib/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  if (!getProject(db, id)) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const fields: { marathon_code?: string | null; marathon_account?: string | null; marathon_default_wt?: string | null } = {}
  for (const k of ['marathon_code', 'marathon_account', 'marathon_default_wt'] as const) {
    if (k in body) {
      const v = body[k]
      if (v !== null && typeof v !== 'string') {
        return NextResponse.json({ error: `${k} must be a string or null` }, { status: 400 })
      }
      fields[k] = v ? (v as string).trim() || null : null
    }
  }
  setProjectMarathonFields(db, id, fields)
  return NextResponse.json(getProject(db, id))
}
