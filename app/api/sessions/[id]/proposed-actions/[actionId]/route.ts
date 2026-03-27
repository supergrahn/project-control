import { NextResponse } from 'next/server'
import { getDb, dismissProposedAction } from '@/lib/db'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { actionId } = await params
  dismissProposedAction(getDb(), actionId)
  return NextResponse.json({ ok: true })
}
