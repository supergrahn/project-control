import { NextResponse } from 'next/server'
import { getDb, updateProjectAutomationLevel, getProjectAutomationLevel } from '@/lib/db'
import type { AutomationLevel } from '@/lib/orchestrator-types'

const VALID: AutomationLevel[] = ['manual', 'checkpoint', 'auto']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return NextResponse.json({ level: getProjectAutomationLevel(getDb(), id) })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { level } = await req.json() as { level?: string }
  if (!level || !VALID.includes(level as AutomationLevel)) {
    return NextResponse.json({ error: `Invalid level: ${level}` }, { status: 400 })
  }
  updateProjectAutomationLevel(getDb(), id, level as AutomationLevel)
  return NextResponse.json({ ok: true })
}
