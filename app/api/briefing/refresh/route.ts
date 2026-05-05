import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { enqueueJob } from '@/lib/jobs/runner'

export async function POST(req: Request) {
  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? '__all__'
  const today = new Date().toISOString().slice(0, 10)
  enqueueJob(getDb(), 'briefing_synthesize', { scope }, { dedupKey: `briefing_synthesize:${scope}:${today}:force` })
  return NextResponse.json({ ok: true }, { status: 202 })
}
