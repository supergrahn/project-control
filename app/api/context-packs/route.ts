import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, listContextPacks, createContextPack, updateContextPack, deleteContextPack } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  return NextResponse.json(listContextPacks(getDb(), projectId))
}

export async function POST(req: Request) {
  const { projectId, title, content, sourceUrl } = await req.json()
  if (!projectId || !title || !content) return NextResponse.json({ error: 'projectId, title, content required' }, { status: 400 })
  const id = randomUUID()
  createContextPack(getDb(), { id, project_id: projectId, title, content, source_url: sourceUrl })
  return NextResponse.json({ id }, { status: 201 })
}

export async function PUT(req: Request) {
  const { id, title, content } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updateContextPack(getDb(), id, { title, content })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteContextPack(getDb(), id)
  return NextResponse.json({ ok: true })
}
