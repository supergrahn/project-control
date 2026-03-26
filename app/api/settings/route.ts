import { NextResponse } from 'next/server'
import { getDb, getAllGlobalSettings, setGlobalSetting } from '@/lib/db'

const ALLOWED_KEYS = ['git_root'] as const
type AllowedKey = typeof ALLOWED_KEYS[number]

export function GET() {
  const db = getDb()
  return NextResponse.json(getAllGlobalSettings(db))
}

export async function POST(req: Request) {
  const body = await req.json()
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const db = getDb()
  for (const key of ALLOWED_KEYS) {
    if (!(key in body)) continue
    const val = body[key]
    if (val !== null && typeof val !== 'string') {
      return NextResponse.json({ error: `${key} must be a string or null` }, { status: 400 })
    }
    setGlobalSetting(db, key, val ? val.trim() || null : null)
  }
  return NextResponse.json({ ok: true })
}
