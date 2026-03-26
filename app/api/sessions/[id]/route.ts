import { NextResponse } from 'next/server'
import { killSession } from '@/lib/session-manager'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  killSession(id)
  return NextResponse.json({ ok: true })
}
