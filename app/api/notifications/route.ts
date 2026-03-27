import { NextResponse } from 'next/server'
import { getDb, getUnreadEvents, getUnreadEventCount, markNotificationRead, markAllNotificationsRead } from '@/lib/db'

export async function GET() {
  const db = getDb()
  return NextResponse.json({ unreadCount: getUnreadEventCount(db), events: getUnreadEvents(db) })
}

export async function POST(req: Request) {
  const { eventId, markAll } = await req.json()
  const db = getDb()
  if (markAll) {
    markAllNotificationsRead(db)
  } else if (eventId) {
    markNotificationRead(db, eventId)
  }
  return NextResponse.json({ ok: true })
}
