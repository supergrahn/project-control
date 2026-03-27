// app/api/sessions/audit/route.ts
import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDb, getProject } from '@/lib/db'
import { logEvent } from '@/lib/events'
import { resolveMemoryDir, listMemoryFiles } from '@/lib/memory'
import { buildAuditPrompt, buildFrontmatter } from '@/lib/prompts'

function resolveClaude(): string {
  const candidates = [
    `${os.homedir()}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return execSync('which claude', { encoding: 'utf8' }).trim()
}

export async function POST(req: Request) {
  const { projectId, planFile } = await req.json()
  if (!projectId || !planFile) {
    return NextResponse.json({ error: 'projectId and planFile required' }, { status: 400 })
  }

  const project = getProject(getDb(), projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const projectRoot = path.resolve(project.path)
  const absPlanFile = path.resolve(planFile)
  if (!absPlanFile.startsWith(projectRoot + path.sep)) {
    return NextResponse.json({ error: 'planFile must be within project' }, { status: 400 })
  }
  if (!fs.existsSync(absPlanFile)) {
    return NextResponse.json({ error: 'plan file not found' }, { status: 404 })
  }

  const planContent = fs.readFileSync(absPlanFile, 'utf8')
  const planFilename = path.basename(absPlanFile)
  const planBasename = path.basename(absPlanFile, '.md')

  // Try to find matching spec
  let specContent: string | null = null
  if (project.specs_dir) {
    const specPath = path.resolve(project.path, project.specs_dir, planFilename)
    if (fs.existsSync(specPath)) specContent = fs.readFileSync(specPath, 'utf8')
  }

  // Load memory
  let memoryContent: string | null = null
  const memoryDir = resolveMemoryDir(project.path)
  if (memoryDir) {
    const files = listMemoryFiles(memoryDir)
    if (files.length > 0) {
      memoryContent = files.map(f => `### [${f.type}] ${f.name}\n${f.content}`).join('\n\n---\n\n')
    }
  }

  const auditedAt = new Date().toISOString()
  const prompt = buildAuditPrompt({ planFilename, planContent, specContent, memoryContent })

  // Resolve output dir
  const plansDir = project.plans_dir ? path.resolve(project.path, project.plans_dir) : path.dirname(absPlanFile)
  const auditsDir = path.join(plansDir, 'audits')
  fs.mkdirSync(auditsDir, { recursive: true })

  const dateStr = new Date().toISOString().slice(0, 10)
  const auditFile = path.join(auditsDir, `${planBasename}-audit-${dateStr}.md`)

  // Spawn claude --print
  const claudeBin = resolveClaude()
  const output = await new Promise<string>((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(claudeBin, ['--print', '--output-format', 'text'], {
      cwd: project.path,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (!proc.stdin) return reject(new Error('claude stdin not available'))
    proc.stdin.write(prompt)
    proc.stdin.end()
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited ${code}: ${stderr}`))
      else resolve(stdout)
    })
    proc.on('error', reject)
  })

  const frontmatter = buildFrontmatter(output, auditedAt, planFilename)
  fs.writeFileSync(auditFile, frontmatter + output, 'utf8')

  const blockersSection = output.match(/## 🔴 Blockers\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const warningsSection = output.match(/## 🟡 Warnings\n([\s\S]*?)(?=\n##|$)/)?.[1] ?? ''
  const blockerCount = blockersSection.includes('None found') ? 0 : (blockersSection.match(/^- /gm)?.length ?? 0)
  const warningCount = warningsSection.includes('None found') ? 0 : (warningsSection.match(/^- /gm)?.length ?? 0)

  logEvent(getDb(), {
    projectId,
    type: 'audit_completed',
    summary: `Audit of ${planFilename}: ${blockerCount === 0 && warningCount === 0 ? 'clean' : `${blockerCount} blockers, ${warningCount} warnings`}`,
    severity: blockerCount > 0 ? 'warn' : 'info',
  })

  return NextResponse.json({ ok: true, auditFile })
}
