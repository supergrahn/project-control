import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, listTemplates, createTemplate, deleteTemplate } from '@/lib/db'

export async function GET() {
  return NextResponse.json(listTemplates(getDb()))
}

export async function POST(req: Request) {
  const { name, description, dirs } = await req.json()
  if (!name || !dirs) return NextResponse.json({ error: 'name and dirs required' }, { status: 400 })
  const id = randomUUID()
  createTemplate(getDb(), { id, name, description, dirs: JSON.stringify(dirs) })
  return NextResponse.json({ id }, { status: 201 })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteTemplate(getDb(), id)
  return NextResponse.json({ ok: true })
}
