// lib/session-manager.ts
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { WebSocket } from 'ws'
import fs from 'fs'
import { EventEmitter } from 'events'
import { getDb, createSession, endSession, getActiveSessionForFile, getProject, listContextPacks } from './db'
import { logEvent } from './events'
import { buildArgs, buildSessionContext, Phase, PermissionMode } from './prompts'
import { getTask, updateTask } from './db/tasks'
import { getAgent, updateAgent } from './db/agents'
import { writeInstructions, deleteInstructions } from './agents/writeInstructions'
import { getSkillsByProject } from './db/skills'
import { buildTaskContext } from './prompts'
import { getGitHistory } from './git'
import path from 'path'
import { randomUUID } from 'crypto'
import { execFileSync } from 'child_process'
import { writeFrontmatter } from './frontmatter'
import { resolveProvider } from './sessions/resolveProvider'
import { getActiveProviders, getProviders, createProvider, type ProviderType } from './db/providers'
import { getAdapter } from './sessions/adapters'
import { insertSessionEvent, getSessionEvents, flushSessionEvents } from './db/sessionEvents'

// --- Process maps (survive Next.js hot-reload via globalThis) ---
declare global {
  var procMap: Map<string, ChildProcess>
  var wsMap: Map<string, Set<WebSocket>>
  var hangTimers: Map<string, NodeJS.Timeout>
  var procStderr: Map<string, string>
}
globalThis.procMap ??= new Map()
globalThis.wsMap ??= new Map()
globalThis.hangTimers ??= new Map()
globalThis.procStderr ??= new Map()

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
  const project = getProject(getDb(), projectId)
  if (project) {
    getProjectEmitter(project.path).emit('session-ended', payload)
  }
}

export const procMap = globalThis.procMap
export const wsMap = globalThis.wsMap
const hangTimers = globalThis.hangTimers
const procStderr = globalThis.procStderr

// --- Hang timer helpers ---
function resetHangTimer(sessionId: string): void {
  if (hangTimers.has(sessionId)) {
    clearTimeout(hangTimers.get(sessionId)!)
  }

  const timer = setTimeout(() => {
    broadcast(sessionId, {
      type: 'status',
      state: 'unresponsive',
      message: 'No output for 5 minutes — session may be stuck',
    })
  }, 5 * 60 * 1000) // 5 minutes

  hangTimers.set(sessionId, timer)
}

function clearHangTimer(sessionId: string): void {
  if (hangTimers.has(sessionId)) {
    clearTimeout(hangTimers.get(sessionId)!)
    hangTimers.delete(sessionId)
  }
}

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
  taskId?: string
  outputPath?: string
  agentId?: string
}

const KNOWN_PROVIDERS: { type: ProviderType; command: string; name: string }[] = [
  { type: 'claude', command: 'claude', name: 'Claude Code' },
  { type: 'gemini', command: 'gemini', name: 'Gemini CLI' },
  { type: 'codex', command: 'codex', name: 'Codex CLI' },
]

function binaryExists(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Auto-seed providers from installed CLI binaries when none are configured. */
export function autoDetectProviders(db: ReturnType<typeof getDb>): void {
  if (getProviders(db).length > 0) return
  for (const p of KNOWN_PROVIDERS) {
    if (binaryExists(p.command)) {
      createProvider(db, { id: randomUUID(), name: p.name, type: p.type, command: p.command, config: null })
    }
  }
}

export function isClaudeAvailable(): boolean {
  const db = getDb()
  autoDetectProviders(db)
  return getActiveProviders(db).length > 0
}

export function spawnSession(opts: SpawnOptions): string {
  const db = getDb()
  const provider = resolveProvider(db, {
    projectId: opts.projectId,
    taskId: opts.taskId,
    agentId: opts.agentId,
  })
  const sessionId = randomUUID()

  if (opts.agentId) {
    const agent = getAgent(db, opts.agentId)
    if (agent) {
      const project = getProject(db, opts.projectId)
      if (project) {
        try {
          writeInstructions(agent, project, provider.type)
        } catch (err) {
          console.warn('Agent provider resolution failed:', err)
        }
        updateAgent(db, opts.agentId, { status: 'running' })
      }
    }
  }

  // Block concurrent sessions on the same file
  if (opts.sourceFile) {
    const canonical = fs.realpathSync(opts.sourceFile)
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  const contextPacks = listContextPacks(db, opts.projectId).map(p => ({ title: p.title, content: p.content }))

  // Assemble task context if taskId is provided
  let fullContext = opts.userContext
  if (opts.taskId) {
    const task = getTask(db, opts.taskId)
    if (task) {
      let taskBlock = buildTaskContext(task)
      if (opts.outputPath) {
        taskBlock += `\n\n## Output Path\nWrite your output to: ${opts.outputPath}`
      }
      if (taskBlock) {
        fullContext = `${taskBlock}\n\n---\n\n${opts.userContext}`
      }
    }
  }

  let systemPrompt = buildSessionContext({
    phase: opts.phase,
    sourceFile: opts.sourceFile,
    userContext: fullContext,
    gitHistory: getGitHistory(opts.projectPath),
    correctionNote: opts.correctionNote,
    contextPacks: contextPacks.length > 0 ? contextPacks : null,
  })

  // Inject project skills into system prompt
  const projectSkills = getSkillsByProject(db, opts.projectId)
  if (projectSkills.length > 0) {
    const skillsProject = getProject(db, opts.projectId)
    if (skillsProject) {
      const skillsContent = projectSkills
        .map(s => {
          try {
            const content = fs.readFileSync(path.join(skillsProject.path, s.file_path), 'utf8')
            return `## Skill: ${s.name}\n\n${content}`
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .join('\n\n---\n\n')
      if (skillsContent) {
        systemPrompt += `\n\n---\n\n# Project Skills\n\n${skillsContent}`
      }
    }
  }

  const args = buildArgs({
    systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId,
    providerType: provider.type,
  })

  const proc = spawn(provider.command, args, {
    cwd: opts.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const canonical = opts.sourceFile ? fs.realpathSync(opts.sourceFile) : null
  try {
    createSession(db, {
      id: sessionId,
      projectId: opts.projectId,
      label: opts.label,
      phase: opts.phase as import('./db').SessionPhase,
      sourceFile: canonical,
      taskId: opts.taskId,
      outputPath: opts.outputPath,
      agentId: opts.agentId,
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

  const adapter = getAdapter(provider.type)

  procMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())
  resetHangTimer(sessionId) // Start 5-minute hang detection

  // Handle spawn failures (e.g. command not found)
  proc.on('error', (err) => {
    insertSessionEvent(db, sessionId, {
      type: 'error',
      content: `Spawn error: ${err.message}`,
      metadata: { code: 'spawn_error' },
    })
    getDb().prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run('error', sessionId)
    endSession(getDb(), sessionId)
    procMap.delete(sessionId)
    clearHangTimer(sessionId)
    broadcast(sessionId, {
      type: 'status',
      state: 'ended',
      reason: 'error',
      message: err.message,
    })
    wsMap.delete(sessionId)
  })

  // Read stdout line-by-line
  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      resetHangTimer(sessionId)
      // Parse structured event
      const event = adapter.parseLine(line)
      if (event) {
        insertSessionEvent(db, sessionId, event)
        broadcast(sessionId, { type: 'event', event })
      }
      // Always broadcast raw output for terminal view
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  // Capture stderr for rate limit detection
  if (proc.stderr) {
    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      resetHangTimer(sessionId)
      // Accumulate stderr for error detection on close
      const current = procStderr.get(sessionId) ?? ''
      procStderr.set(sessionId, current + '\n' + line)

      const isRateLimit = adapter.rateLimitPatterns.some(p => p.test(line))
      if (isRateLimit) {
        db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId)
        insertSessionEvent(db, sessionId, {
          type: 'error',
          content: line,
          metadata: { code: 'rate_limit', isRateLimit: true },
        })
        broadcast(sessionId, {
          type: 'status',
          state: 'paused',
          reason: 'rate_limit',
          provider: provider.name,
        })
      }
      // Also broadcast stderr as output
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  proc.on('close', (code, signal) => {
    clearHangTimer(sessionId)

    // Determine exit reason
    let exitReason: string
    let exitMessage: string

    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      exitReason = 'killed'
      exitMessage = 'Session stopped by user'
    } else if (code === 0) {
      exitReason = 'completed'
      exitMessage = 'Session completed successfully'
    } else {
      const stderrContent = procStderr.get(sessionId) ?? ''
      if (stderrContent && adapter.rateLimitPatterns.some(p => p.test(stderrContent))) {
        exitReason = 'rate_limit'
        exitMessage = 'Rate limit exceeded — session ended'
      } else {
        exitReason = 'error'
        exitMessage = stderrContent.split('\n').filter(l => l).slice(-1)[0] || `Process exited with code ${code}`
      }
    }

    // Update DB with exit reason
    getDb().prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run(exitReason, sessionId)

    endSession(getDb(), sessionId)
    if (opts.agentId) {
      const project = getProject(getDb(), opts.projectId)
      if (project) {
        deleteInstructions(project, provider.type)
      }
      updateAgent(getDb(), opts.agentId, { status: 'idle' })
    }
    // Write artifact refs back to task on session end
    if (opts.taskId) {
      const phaseToField: Record<string, 'idea_file' | 'spec_file' | 'plan_file'> = {
        ideate:     'idea_file',
        brainstorm: 'idea_file',
        spec:       'spec_file',
        plan:       'plan_file',
      }
      const field = phaseToField[opts.phase]
      if (field && opts.outputPath) {
        if (fs.existsSync(opts.outputPath)) {
          updateTask(getDb(), opts.taskId, { [field]: opts.outputPath })
        }
      }
    }
    // Flush session events to log file
    const logDir = path.join(process.cwd(), 'data', 'sessions')
    const logPath = path.join(logDir, `${sessionId}.jsonl`)
    try {
      flushSessionEvents(getDb(), sessionId, logPath)
      if (opts.taskId) {
        updateTask(getDb(), opts.taskId, { session_log: logPath })
      }
    } catch {}
    logEvent(getDb(), {
      projectId: opts.projectId,
      type: 'session_ended',
      summary: `${opts.phase} session ended: ${opts.label}`,
      severity: 'info',
    })
    emitSessionEnded(opts.projectId, { session_id: sessionId, source_file: opts.sourceFile, exit_reason: exitReason })

    procMap.delete(sessionId)
    procStderr.delete(sessionId)
    broadcast(sessionId, {
      type: 'status',
      state: 'ended',
      reason: exitReason,
      message: exitMessage,
    })
    wsMap.delete(sessionId)
  })

  return sessionId
}

export function killSession(sessionId: string): void {
  const proc = procMap.get(sessionId)
  if (proc) {
    // Set exit_reason before kill triggers close event
    getDb().prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run('killed', sessionId)
    // proc.kill() triggers the 'close' event which handles cleanup,
    // broadcasting 'ended', flushing events, and map deletion.
    try { proc.kill() } catch {}
  } else {
    // Process already gone — clean up DB and maps directly
    getDb().prepare('UPDATE sessions SET exit_reason = ? WHERE id = ?').run('killed', sessionId)
    endSession(getDb(), sessionId)
    clearHangTimer(sessionId)
    broadcast(sessionId, {
      type: 'status',
      state: 'ended',
      reason: 'killed',
      message: 'Session stopped by user',
    })
    wsMap.delete(sessionId)
  }
}

export function isAlive(sessionId: string): boolean {
  return procMap.has(sessionId)
}

// --- Broadcast helper ---
function broadcast(sessionId: string, msg: Record<string, unknown>): void {
  const clients = wsMap.get(sessionId) ?? new Set()
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(json)
    }
  }
}

// --- WebSocket protocol types ---
type WsClientMessage =
  | { type: 'attach'; sessionId: string }
  | { type: 'input'; data: string }

// --- WebSocket handler ---
export function handleWebSocket(ws: WebSocket): void {
  let attachedSessionId: string | null = null

  ws.on('message', (raw) => {
    let msg: WsClientMessage
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'attach') {
      const { sessionId } = msg
      attachedSessionId = sessionId

      // Replay events from session_events table
      const events = getSessionEvents(getDb(), sessionId)
      for (const event of events) {
        ws.send(JSON.stringify({
          type: 'event',
          event: {
            id: event.id,
            type: event.type,
            role: event.role,
            content: event.content,
            metadata: event.metadata ? JSON.parse(event.metadata) : null,
            created_at: event.created_at,
          },
        }))
      }

      // Register client
      if (!wsMap.has(sessionId)) wsMap.set(sessionId, new Set())
      wsMap.get(sessionId)!.add(ws)

      // Send current status
      const alive = procMap.has(sessionId)
      ws.send(JSON.stringify({ type: 'status', state: alive ? 'active' : 'ended' }))
    }

    if (msg.type === 'input' && attachedSessionId && typeof msg.data === 'string') {
      const proc = procMap.get(attachedSessionId)
      if (proc?.stdin?.writable) {
        proc.stdin.write(msg.data + '\n')
      }
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
  const sessionId = randomUUID()
  const db = getDb()
  const provider = resolveProvider(db, { projectId: opts.projectId })

  const mcpPort = parseInt(process.env.ORCHESTRATOR_MCP_PORT ?? '3002', 10)
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
    providerType: provider.type,
  })

  const proc = spawn(provider.command, args, {
    cwd: opts.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  createSession(db, {
    id: sessionId,
    projectId: opts.projectId,
    label: 'Orchestrator',
    phase: 'orchestrator',
    sourceFile: null,
  })

  const adapter = getAdapter(provider.type)

  procMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())

  // Handle spawn failures (e.g. command not found)
  proc.on('error', (err) => {
    insertSessionEvent(db, sessionId, {
      type: 'error',
      content: `Spawn error: ${err.message}`,
      metadata: { code: 'spawn_error' },
    })
    endSession(db, sessionId)
    procMap.delete(sessionId)
    broadcast(sessionId, { type: 'status', state: 'ended' })
    wsMap.delete(sessionId)
  })

  if (proc.stdout) {
    const rl = createInterface({ input: proc.stdout })
    rl.on('line', (line) => {
      const event = adapter.parseLine(line)
      if (event) {
        insertSessionEvent(db, sessionId, event)
        broadcast(sessionId, { type: 'event', event })
      }
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  if (proc.stderr) {
    const rlErr = createInterface({ input: proc.stderr })
    rlErr.on('line', (line) => {
      const isRateLimit = adapter.rateLimitPatterns.some(p => p.test(line))
      if (isRateLimit) {
        db.prepare("UPDATE sessions SET status = 'paused' WHERE id = ?").run(sessionId)
        insertSessionEvent(db, sessionId, {
          type: 'error',
          content: line,
          metadata: { code: 'rate_limit', isRateLimit: true },
        })
        broadcast(sessionId, { type: 'rate_limit', provider: provider.name })
      }
      broadcast(sessionId, { type: 'output', data: line })
    })
  }

  proc.on('close', () => {
    endSession(db, sessionId)
    // Flush session events to log file
    const logDir = path.join(process.cwd(), 'data', 'sessions')
    const logPath = path.join(logDir, `${sessionId}.jsonl`)
    try { flushSessionEvents(db, sessionId, logPath) } catch {}
    procMap.delete(sessionId)
    broadcast(sessionId, { type: 'status', state: 'ended' })
    wsMap.delete(sessionId)
  })

  return sessionId
}
