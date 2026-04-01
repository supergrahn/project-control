import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getDb } from '@/lib/db'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params
  const db = getDb()

  try {
    // Look up session to get the log path or reconstruct it
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const logPath = path.join(process.cwd(), 'data', 'sessions', `${sessionId}.jsonl`)

    if (!fs.existsSync(logPath)) {
      // Return empty array if log doesn't exist yet
      return NextResponse.json([])
    }

    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(line => line.length > 0)
    const entries = lines.map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return { type: 'error', content: line, created_at: new Date().toISOString() }
      }
    })

    return NextResponse.json(entries)
  } catch (err) {
    console.error('Failed to fetch session log:', err)
    return NextResponse.json({ error: 'Failed to fetch session log' }, { status: 500 })
  }
}
