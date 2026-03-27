import { NextResponse } from 'next/server'
import { getDb, touchProject } from '@/lib/db'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  touchProject(getDb(), id)
  return NextResponse.json({ ok: true })
}
