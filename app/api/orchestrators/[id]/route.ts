import { NextResponse } from 'next/server'
import { getDb, getOrchestratorById, updateOrchestratorStatus } from '@/lib/db'
import { killSession } from '@/lib/session-manager'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const orch = getOrchestratorById(db, id)
  if (!orch) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  killSession(orch.session_id)
  updateOrchestratorStatus(db, id, 'ended')
  return NextResponse.json({ ok: true })
}
