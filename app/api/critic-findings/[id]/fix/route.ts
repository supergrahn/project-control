import { NextResponse } from 'next/server'
import { getDb, getProject } from '@/lib/db'
import { spawnSession, type SpawnOptions } from '@/lib/session-manager'
import path from 'path'

type Issue = { severity: string; category: string; message: string }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Step 0: parse body
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  // Step 1: parseInt id
  const { id: rawId } = await params
  const id = parseInt(rawId, 10)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // Step 2: required fields
  const { category, message, severity } = body as { category?: string; message?: string; severity?: string }
  if (!category || !message || !severity) {
    return NextResponse.json({ error: 'category, message, severity required' }, { status: 400 })
  }
  // Step 3: severity allowlist
  if (severity !== 'critical' && severity !== 'high') {
    return NextResponse.json({ error: 'severity must be critical or high' }, { status: 400 })
  }

  // Step 4: lookup
  const db = getDb()
  const finding = db.prepare(`SELECT * FROM critic_findings WHERE id = ?`).get(id) as
    | { id: number; project_id: string; kind: string; ref: string; findings: string }
    | undefined
  if (!finding) return NextResponse.json({ error: 'finding not found' }, { status: 404 })

  // Step 5: kind allowlist
  if (finding.kind !== 'spec' && finding.kind !== 'plan') {
    return NextResponse.json({ error: 'kind must be spec or plan' }, { status: 400 })
  }

  // Step 6: trio match against findings.issues
  let issues: Issue[] = []
  try { issues = (JSON.parse(finding.findings) as { issues?: Issue[] }).issues ?? [] } catch { issues = [] }
  const match = issues.find(i => i.category === category && i.message === message && i.severity === severity)
  if (!match) return NextResponse.json({ error: 'issue not found in finding' }, { status: 400 })

  const project = getProject(db, finding.project_id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const sourceFile = path.isAbsolute(finding.ref) ? finding.ref : path.join(project.path, finding.ref)

  const userContext = `<!-- briefing-fix:auto -->
## Critic finding to address

**Kind:** ${finding.kind}
**File:** ${finding.ref}
**Severity:** ${severity}
**Category:** ${category}
**Message:** ${message}
`

  // Step 7: spawn
  try {
    const newId = await spawnSession({
      projectId: finding.project_id,
      projectPath: project.path,
      label: `Fix critic finding: ${category}`.slice(0, 200),
      phase: finding.kind as SpawnOptions['phase'],
      sourceFile,
      taskId: undefined,
      agentId: undefined,
      userContext,
      permissionMode: 'default',
      correctionNote: undefined,
      outputPath: undefined,
    })
    return NextResponse.json({ sessionId: newId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('CONCURRENT_SESSION:')) {
      return NextResponse.json({ error: 'concurrent session for this file', existingId: msg.split(':')[1] }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
