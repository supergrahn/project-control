import { NextResponse } from 'next/server'
import { getDb, listProjects } from '@/lib/db'
import { scanTechStack } from '@/lib/tech-audit'

export function GET() {
  const projects = listProjects(getDb())
  const report = scanTechStack(projects)
  return NextResponse.json(report)
}
