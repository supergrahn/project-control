import { NextResponse } from 'next/server'
import { isClaudeAvailable } from '@/lib/session-manager'

export async function GET(_req: Request) {
  return NextResponse.json({ claudeAvailable: isClaudeAvailable() })
}
