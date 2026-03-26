import { NextResponse } from 'next/server'
import { isClaudeAvailable } from '@/lib/session-manager'

export function GET() {
  return NextResponse.json({ claudeAvailable: isClaudeAvailable() })
}
