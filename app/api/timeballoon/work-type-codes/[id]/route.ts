// DELETE /api/timeballoon/work-type-codes/[id] — remove a work-type code.

import { NextRequest, NextResponse } from 'next/server'
import { getDb, deleteWorkTypeCode, listWorkTypeCodes } from '@/lib/db'
import { requireToken } from '@/lib/timeballoon-auth'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = requireToken(req)
  if (authError) return authError
  const { id } = await params
  const n = parseInt(id, 10)
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  const db = getDb()
  deleteWorkTypeCode(db, n)
  return NextResponse.json(listWorkTypeCodes(db))
}
