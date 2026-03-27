// app/api/assistant/route.ts
import { spawn } from 'child_process'
import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import { getDb, listProjects, getActiveSessions, getProject } from '@/lib/db'
import { buildDashboardData } from '@/lib/dashboard'
import { buildAssistantSystemPrompt } from '@/lib/assistant'
import { resolveMemoryDir, listMemoryFiles } from '@/lib/memory'
import { getRecentEvents } from '@/lib/events'

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
  const { message, projectId, page, history = [] } = await req.json() as {
    message: string
    projectId?: string
    page?: string
    history?: Array<{ role: string; content: string }>
  }

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'message required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const db = getDb()
  const projects = listProjects(db)
  const activeSessions = getActiveSessions(db)
  const dashboardData = buildDashboardData(projects, activeSessions)

  let projectName: string | undefined
  let projectPath: string | undefined
  let memoryFiles: ReturnType<typeof listMemoryFiles> | undefined
  let recentEvents: ReturnType<typeof getRecentEvents> | undefined

  if (projectId) {
    const project = getProject(db, projectId)
    if (project) {
      projectName = project.name
      projectPath = project.path
      const memDir = resolveMemoryDir(project.path)
      if (memDir) memoryFiles = listMemoryFiles(memDir)
    }
  }

  recentEvents = getRecentEvents(db, 10)

  const systemPrompt = buildAssistantSystemPrompt({
    dashboardData,
    projectName,
    projectPath,
    memoryFiles,
    recentEvents,
    currentPage: page,
  })

  // Build the full prompt with history
  const fullPrompt = [
    ...history.map(h => `${h.role === 'user' ? 'Human' : 'Assistant'}: ${h.content}`),
    `Human: ${message}`,
  ].join('\n\n')

  const claudeBin = resolveClaude()
  const enc = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn(claudeBin, ['--print', '--output-format', 'text', '--system-prompt', systemPrompt], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (!proc.stdin) {
        controller.enqueue(enc.encode('Error: could not start Claude'))
        controller.close()
        return
      }

      proc.stdin.write(fullPrompt)
      proc.stdin.end()

      proc.stdout.on('data', (chunk: Buffer) => {
        try {
          controller.enqueue(enc.encode(chunk.toString()))
        } catch {
          proc.kill()
        }
      })

      proc.stderr.on('data', () => {})

      proc.on('close', () => {
        try { controller.close() } catch {}
      })

      proc.on('error', () => {
        try { controller.close() } catch {}
      })

      req.signal.addEventListener('abort', () => {
        proc.kill()
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
