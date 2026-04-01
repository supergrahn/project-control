import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params
  const db = getDb()

  try {
    const sessions = db
      .prepare('SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC')
      .all(taskId) as any[]

    return NextResponse.json(sessions)
  } catch (err) {
    console.error('Failed to fetch sessions:', err)
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }
}
