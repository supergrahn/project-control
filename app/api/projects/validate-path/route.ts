import { NextRequest, NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import path from 'path'

export function GET(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get('path')
  if (!rawPath) {
    return NextResponse.json({ valid: false, name: '', error: 'path required' }, { status: 400 })
  }

  try {
    execFileSync('git', ['-C', rawPath, 'rev-parse', '--git-dir'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    })
    return NextResponse.json({ valid: true, name: path.basename(rawPath) })
  } catch {
    return NextResponse.json({ valid: false, name: '', error: 'Not a git repository' })
  }
}
