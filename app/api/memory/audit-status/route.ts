// app/api/memory/audit-status/route.ts
import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import fs from 'fs'
import path from 'path'

type AuditStatus = {
  blockers: number
  warnings: number
  auditFile: string
  auditedAt: string
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  return Object.fromEntries(
    match[1].split('\n')
      .map(l => l.match(/^(\w+):\s*(.+)$/))
      .filter(Boolean)
      .map(m => [m![1], m![2].trim()])
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 })

  const project = getProject(getDb(), projectId)
  if (!project || !project.plans_dir) return NextResponse.json({})

  const auditsDir = path.join(path.resolve(project.path, project.plans_dir), 'audits')
  if (!fs.existsSync(auditsDir)) return NextResponse.json({})

  const result: Record<string, AuditStatus> = {}

  const files = fs.readdirSync(auditsDir)
    .filter(f => f.endsWith('.md') && f.includes('-audit-'))
    .sort() // lexicographic = date order (YYYY-MM-DD suffix)

  for (const filename of files) {
    // filename: {planBasename}-audit-{YYYY-MM-DD}.md
    const match = filename.match(/^(.+)-audit-\d{4}-\d{2}-\d{2}\.md$/)
    if (!match) continue
    const planBasename = match[1]

    const filePath = path.join(auditsDir, filename)
    const content = fs.readFileSync(filePath, 'utf8')
    const fm = parseFrontmatter(content)

    result[planBasename] = {
      blockers: parseInt(fm.blockers ?? '0', 10) || 0,
      warnings: parseInt(fm.warnings ?? '0', 10) || 0,
      auditFile: filePath,
      auditedAt: fm.audited_at ?? '',
    }
  }

  return NextResponse.json(result)
}
