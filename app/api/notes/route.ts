import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Notes are stored in a simple key-value table
// Key = file path, Value = note text

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('filePath')
  if (!filePath) return NextResponse.json({ error: 'filePath required' }, { status: 400 })

  const db = getDb()

  const row = db.prepare('SELECT note FROM feature_notes WHERE file_path = ?').get(filePath) as { note: string } | undefined
  return NextResponse.json({ note: row?.note ?? null })
}

export async function PUT(req: Request) {
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('filePath')
  if (!filePath) return NextResponse.json({ error: 'filePath required' }, { status: 400 })

  const { note } = await req.json() as { note: string }
  if (typeof note !== 'string') return NextResponse.json({ error: 'note must be a string' }, { status: 400 })

  const db = getDb()

  if (note.trim()) {
    db.prepare('INSERT OR REPLACE INTO feature_notes (file_path, note, updated_at) VALUES (?, ?, ?)')
      .run(filePath, note, new Date().toISOString())
  } else {
    db.prepare('DELETE FROM feature_notes WHERE file_path = ?').run(filePath)
  }

  return NextResponse.json({ ok: true })
}
