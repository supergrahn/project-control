import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, listBookmarks, createBookmark, deleteBookmark } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined
  return NextResponse.json(listBookmarks(getDb(), projectId))
}

export async function POST(req: Request) {
  const { projectId, title, content, sourceUrl, tags } = await req.json()
  if (!title || !content) return NextResponse.json({ error: 'title and content required' }, { status: 400 })
  const id = randomUUID()
  createBookmark(getDb(), { id, project_id: projectId, title, content, source_url: sourceUrl, tags })
  return NextResponse.json({ id }, { status: 201 })
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteBookmark(getDb(), id)
  return NextResponse.json({ ok: true })
}
