import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getDb, createBookmark } from '@/lib/db'

export async function POST(req: Request) {
  const { title, content, projectId, tags } = await req.json()
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })
  const id = randomUUID()
  createBookmark(getDb(), {
    id,
    project_id: projectId,
    title: title || `Paste ${new Date().toISOString().slice(0, 16)}`,
    content,
    tags,
  })
  return NextResponse.json({ id }, { status: 201 })
}
