import * as pty from 'node-pty'
import { WebSocket } from 'ws'
import { execSync } from 'child_process'
import fs from 'fs'
import { EventEmitter } from 'events'
import { getDb, createSession, endSession, getActiveSessionForFile, getProject, listContextPacks } from './db'
import { logEvent } from './events'
import { buildArgs, buildSessionContext, Phase, PermissionMode } from './prompts'
import { getGitHistory } from './git'
import path from 'path'
import { randomUUID } from 'crypto'
import { generateDebrief } from './debrief'
import { writeFrontmatter } from './frontmatter'

// --- PTY maps (survive Next.js hot-reload via globalThis) ---
declare global {
  var ptyMap: Map<string, pty.IPty>
  var wsMap: Map<string, Set<WebSocket>>
  var outputBuffer: Map<string, string[]>
}
globalThis.ptyMap ??= new Map()
globalThis.wsMap ??= new Map()
globalThis.outputBuffer ??= new Map()

// Per-project event emitter for orchestrator wake-up
declare global {
  var projectEmitters: Map<string, EventEmitter>
}
globalThis.projectEmitters ??= new Map()

export function getProjectEmitter(projectPath: string): EventEmitter {
  if (!globalThis.projectEmitters.has(projectPath)) {
    globalThis.projectEmitters.set(projectPath, new EventEmitter())
  }
  return globalThis.projectEmitters.get(projectPath)!
}

export function emitSessionEnded(projectId: string, payload: { session_id: string; source_file: string | null; exit_reason: string }): void {
  // Look up project path for emitter
  const project = getProject(getDb(), projectId)
  if (project) {
    getProjectEmitter(project.path).emit('session-ended', payload)
  }
}

export const ptyMap = globalThis.ptyMap
export const wsMap = globalThis.wsMap
export const outputBuffer = globalThis.outputBuffer

// --- Claude binary resolution ---
function resolveClaude(): string {
  const candidates = [
    `${process.env.HOME}/.local/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim()
  } catch {
    throw new Error('Claude binary not found. Install Claude Code: https://claude.ai/code')
  }
}

let CLAUDE_BIN: string | null = null
try { CLAUDE_BIN = resolveClaude() } catch {}

export function isClaudeAvailable(): boolean { return CLAUDE_BIN !== null }

// --- Session spawning ---
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
  correctionNote?: string
}

export function spawnSession(opts: SpawnOptions): string {
  if (!CLAUDE_BIN) throw new Error('Claude binary not found')
  const db = getDb()
  const sessionId = randomUUID()

  // Block concurrent sessions on the same file
  if (opts.sourceFile) {
    const canonical = fs.realpathSync(opts.sourceFile)
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  const contextPacks = listContextPacks(db, opts.projectId).map(p => ({ title: p.title, content: p.content }))

  const systemPrompt = buildSessionContext({
    phase: opts.phase,
    sourceFile: opts.sourceFile,
    userContext: opts.userContext,
    gitHistory: getGitHistory(opts.projectPath),
    correctionNote: opts.correctionNote,
    contextPacks: contextPacks.length > 0 ? contextPacks : null,
  })

  const args = buildArgs({
    systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId,
  })

  const proc = pty.spawn(CLAUDE_BIN!, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: opts.projectPath,
    env: { ...process.env },
  })

  const canonical = opts.sourceFile ? fs.realpathSync(opts.sourceFile) : null
  try {
    createSession(db, {
      id: sessionId,
      projectId: opts.projectId,
      label: opts.label,
      phase: opts.phase as import('./db').SessionPhase,
      sourceFile: canonical,
    })
    logEvent(db, {
      projectId: opts.projectId,
      type: 'session_started',
      summary: `Started ${opts.phase} session: ${opts.label}`,
      severity: 'info',
    })
  } catch (err) {
    try { proc.kill() } catch {}
    throw err
  }

  // Write session_id into source file frontmatter
  if (opts.sourceFile && (opts.phase as string) !== 'orchestrator') {
    try {
      const content = fs.readFileSync(opts.sourceFile, 'utf8')
      const updated = writeFrontmatter(content, { [`${opts.phase}_session_id`]: sessionId })
      fs.writeFileSync(opts.sourceFile, updated, 'utf8')
    } catch {}
  }

  ptyMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())
  outputBuffer.set(sessionId, [])

  proc.onData((data) => {
    // Rolling 100-line buffer
    const buf = outputBuffer.get(sessionId) ?? []
    const lines = data.split('\n')
    buf.push(...lines)
    if (buf.length > 100) buf.splice(0, buf.length - 100)
    outputBuffer.set(sessionId, buf)

    // Broadcast to connected clients
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }))
      }
    }
  })

  proc.onExit(() => {
    endSession(getDb(), sessionId)
    logEvent(getDb(), {
      projectId: opts.projectId,
      type: 'session_ended',
      summary: `${opts.phase} session ended: ${opts.label}`,
      severity: 'info',
    })
    emitSessionEnded(opts.projectId, { session_id: sessionId, source_file: opts.sourceFile, exit_reason: 'completed' })
    if (opts.sourceFile) {
      const buf = outputBuffer.get(sessionId) ?? []

      // Save session log and write log_id into frontmatter
      try {
        const logsDir = path.join(path.dirname(opts.sourceFile), 'logs')
        fs.mkdirSync(logsDir, { recursive: true })
        const base = path.basename(opts.sourceFile, '.md')
        const logPath = path.join(logsDir, `${base}-${opts.phase}-log.md`)
        const logFm = `---\nphase: ${opts.phase}\nsource_file: ${opts.sourceFile}\ncreated_at: ${new Date().toISOString()}\n---\n\n`
        fs.writeFileSync(logPath, logFm + buf.join('\n'), 'utf8')

        const srcContent = fs.readFileSync(opts.sourceFile, 'utf8')
        const updatedSrc = writeFrontmatter(srcContent, { [`${opts.phase}_log_id`]: logPath })
        fs.writeFileSync(opts.sourceFile, updatedSrc, 'utf8')
      } catch {}

      // Generate post-session debrief (non-blocking) — keep existing code
      generateDebrief({
        outputBuffer: buf,
        sessionLabel: opts.label,
        phase: opts.phase,
        sourceFile: opts.sourceFile,
        projectPath: opts.projectPath,
      }).then(debriefPath => {
        if (debriefPath) {
          logEvent(getDb(), {
            projectId: opts.projectId,
            type: 'debrief_generated',
            summary: `Debrief generated: ${path.basename(debriefPath)}`,
            severity: 'info',
          })
        }
      }).catch(() => {})
    }
    ptyMap.delete(sessionId)
    outputBuffer.delete(sessionId)
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'status', state: 'ended' }))
      }
    }
    wsMap.delete(sessionId)
  })

  return sessionId
}

export function killSession(sessionId: string): void {
  const proc = ptyMap.get(sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    ptyMap.delete(sessionId)
    outputBuffer.delete(sessionId)
  }
  endSession(getDb(), sessionId)
  wsMap.delete(sessionId)
}

export function isAlive(sessionId: string): boolean {
  return ptyMap.has(sessionId)
}

// --- WebSocket handler ---
export function handleWebSocket(ws: WebSocket): void {
  let attachedSessionId: string | null = null

  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return // ignore malformed JSON
    }

    if (msg.type === 'attach') {
      const { sessionId } = msg
      attachedSessionId = sessionId

      // Send buffered output as replay
      const buf = outputBuffer.get(sessionId) ?? []
      if (buf.length > 0) {
        ws.send(JSON.stringify({ type: 'output', data: buf.join('\n') }))
      }

      // Register client
      if (!wsMap.has(sessionId)) wsMap.set(sessionId, new Set())
      wsMap.get(sessionId)!.add(ws)

      // Send current status
      const alive = ptyMap.has(sessionId)
      ws.send(JSON.stringify({ type: 'status', state: alive ? 'active' : 'ended' }))
    }

    if (msg.type === 'input' && attachedSessionId) {
      ptyMap.get(attachedSessionId)?.write(msg.data)
    }

    if (msg.type === 'resize' && attachedSessionId) {
      ptyMap.get(attachedSessionId)?.resize(msg.cols, msg.rows)
    }
  })

  ws.on('close', () => {
    if (attachedSessionId) {
      wsMap.get(attachedSessionId)?.delete(ws)
    }
  })
}

// --- Orchestrator session spawning ---

const ORCHESTRATOR_CLAUDE_MD = (mcpPort: number, secret: string, projectPath: string) => `# Orchestrator Session

You are the orchestrator for the project at \`${projectPath}\`.

## Role
Watch sessions. Drive the Ideas→Specs→Plans→Developing pipeline. Surface commentary and proposed actions. You do NOT write code.

## MCP Server
Connect to http://localhost:${mcpPort}/mcp with header \`X-Orchestrator-Secret: ${secret}\`.

Tools: list_sessions, read_artifact, read_progress, spawn_session, advance_phase, pause_session, propose_actions, log_decision, notify

## Automation Levels
- \`manual\`: take no action — user controls all transitions
- \`checkpoint\`: pause at every gate for approval
- \`auto\`: advance automatically unless a risk flag is detected

## Risk Heuristics (always gate regardless of automation level)
- Content mentions database migration
- Content mentions auth, tokens, credentials
- Content mentions breaking changes or API contract changes
- Test suite failure detected

## Decision Loop
When a session exits: read its artifacts → evaluate risk → call \`advance_phase\` or \`pause_session(reason)\` + \`propose_actions\`. Always call \`log_decision\` after every action.
`.trim()

export function spawnOrchestratorSession(opts: {
  orchestratorId: string
  projectId: string
  projectPath: string
}): string {
  if (!CLAUDE_BIN) throw new Error('Claude binary not found')
  const sessionId = randomUUID()
  const db = getDb()

  const mcpPort = parseInt(process.env.ORCHESTRATOR_MCP_PORT ?? '3002', 10)
  // Import the actual MCP secret so orchestrator can authenticate
  let secret: string
  try {
    const { getMcpSecret } = require('../server/orchestrator-mcp')
    secret = getMcpSecret()
  } catch {
    secret = process.env.ORCHESTRATOR_MCP_SECRET ?? opts.orchestratorId
  }

  const systemPrompt = ORCHESTRATOR_CLAUDE_MD(mcpPort, secret, opts.projectPath)

  const args = buildArgs({
    systemPrompt,
    userContext: 'Start your orchestrator loop. List sessions and monitor.',
    permissionMode: 'default',
    sessionId,
  })

  const proc = pty.spawn(CLAUDE_BIN!, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: opts.projectPath,
    env: { ...process.env },
  })

  createSession(db, {
    id: sessionId,
    projectId: opts.projectId,
    label: 'Orchestrator',
    phase: 'orchestrator',
    sourceFile: null,
  })

  ptyMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())
  outputBuffer.set(sessionId, [])

  proc.onData((data) => {
    const buf = outputBuffer.get(sessionId) ?? []
    buf.push(...data.split('\n'))
    if (buf.length > 100) buf.splice(0, buf.length - 100)
    outputBuffer.set(sessionId, buf)
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data }))
    }
  })

  proc.onExit(() => {
    endSession(db, sessionId)
    ptyMap.delete(sessionId)
    outputBuffer.delete(sessionId)
    const clients = wsMap.get(sessionId) ?? new Set()
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'status', state: 'ended' }))
    }
    wsMap.delete(sessionId)
  })

  return sessionId
}
