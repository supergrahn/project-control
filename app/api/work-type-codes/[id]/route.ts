// DELETE /api/work-type-codes/[id] — same-origin admin route (no bearer).
import { NextResponse } from 'next/server'
import { getDb, deleteWorkTypeCode, listWorkTypeCodes } from '@/lib/db'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const n = parseInt(id, 10)
  if (!Number.isFinite(n)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const db = getDb()
  deleteWorkTypeCode(db, n)
  return NextResponse.json(listWorkTypeCodes(db))
}
