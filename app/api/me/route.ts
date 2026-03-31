import { NextResponse } from 'next/server'
import { execFileSync } from 'child_process'
import os from 'os'

function gitUserName(): string {
  try {
    return execFileSync('git', ['config', '--global', 'user.name'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe',
    }).trim()
  } catch {
    return os.userInfo().username
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function GET() {
  const name = gitUserName()
  return NextResponse.json({ name, initials: initials(name) })
}
