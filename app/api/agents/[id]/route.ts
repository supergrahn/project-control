import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getAgent, updateAgent, deleteAgent } from '@/lib/db/agents'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const agent = getAgent(getDb(), id)
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(agent)
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = getDb()
  if (!getAgent(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json()
  const input: Record<string, unknown> = {}
  if ('name' in body)        input.name        = body.name
  if ('title' in body)       input.title       = body.title
  if ('provider_id' in body) input.provider_id = body.provider_id
  if ('model' in body)       input.model       = body.model
  if ('status' in body)      input.status      = body.status

  const agent = updateAgent(db, id, input)
  return NextResponse.json(agent)
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const db = getDb()
  if (!getAgent(db, id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  deleteAgent(db, id)
  return NextResponse.json({ ok: true })
}
