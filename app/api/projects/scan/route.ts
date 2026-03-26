import { NextResponse } from 'next/server'
import { scanGitDir } from '@/lib/project-scanner'
import { getDb, getGlobalSetting } from '@/lib/db'
import os from 'os'
import path from 'path'

export function GET() {
  const db = getDb()
  const raw = getGlobalSetting(db, 'git_root')
  const gitRoot = raw
    ? raw.replace(/^~(?=\/|$)/, os.homedir())
    : path.join(os.homedir(), 'git')
  return NextResponse.json(scanGitDir(gitRoot))
}
