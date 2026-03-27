import { NextResponse } from 'next/server'
import { getDb, listDecisions } from '@/lib/db'
import type { DecisionSeverity } from '@/lib/orchestrator-types'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId') ?? undefined
  const severity = (url.searchParams.get('severity') as DecisionSeverity) ?? undefined
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  return NextResponse.json({ decisions: listDecisions(getDb(), { projectId, severity, limit, offset }) })
}
