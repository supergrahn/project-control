import { NextResponse } from 'next/server'
import { getDb, listInsights } from '@/lib/db'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId') ?? undefined
  return NextResponse.json({ insights: listInsights(getDb(), projectId) })
}
