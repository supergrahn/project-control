import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getProvider, updateProvider, deleteProvider, toggleProviderActive } from '@/lib/db/providers'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const provider = getProvider(getDb(), id)
  if (!provider) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(provider)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  if (!getProvider(db, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (body.toggle_active) return NextResponse.json(toggleProviderActive(db, id))

  const allowed = ['name', 'type', 'command', 'config'] as const
  const input: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) input[key] = body[key]
  }
  return NextResponse.json(updateProvider(db, id, input))
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  if (!getProvider(db, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  deleteProvider(db, id)
  return NextResponse.json({ ok: true })
}
