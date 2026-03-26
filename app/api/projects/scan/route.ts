import { NextResponse } from 'next/server'
import { scanGitDir } from '@/lib/project-scanner'

export function GET() {
  return NextResponse.json(scanGitDir())
}
