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
import { renderPrepAsMarkdown } from '@/lib/prep'
import { getActiveProviders, getProviders, createProvider, getProvider, type ProviderType, type Provider } from './db/providers'
import { getAdapter } from './sessions/adapters'
import type { Database } from 'better-sqlite3'
import { insertSessionEvent, getSessionEvents, flushSessionEvents } from './db/sessionEvents'
import { captureSessionSummary } from './sessions/captureSummary'

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

declare global {
  var shutdownRegistered: boolean | undefined
}

if (!globalThis.shutdownRegistered) {
  globalThis.shutdownRegistered = true
  const killAllProcesses = () => {
    for (const proc of globalThis.procMap.values()) {
      try { proc.kill() } catch { /* already dead */ }
    }
  }
  process.on('exit', killAllProcesses)
}

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

/**
 * Prepend the task's prep packet to userContext so spawned sessions start
 * with full context. Idempotent: an `<!-- prep:auto -->` marker prevents
 * double-injection on respawn (sessions.user_context is persisted, so the
 * marker survives the respawn round-trip).
 */
export function prepUserContext(
  db: ReturnType<typeof getDb>,
  taskId: string | undefined,
  originalContext: string,
): string {
  if (!taskId) return originalContext
  const task = getTask(db, taskId)
  if (!task?.prep_notes) return originalContext
  if (originalContext.includes('<!-- prep:auto -->')) return originalContext
  try {
    const notes = JSON.parse(task.prep_notes)
    const rendered = renderPrepAsMarkdown(notes)
    return `<!-- prep:auto -->\n${rendered}\n\n---\n\n${originalContext}`
  } catch {
    return originalContext
  }
}

export async function spawnSession(opts: SpawnOptions): Promise<string> {
  const db = getDb()
  const sessionId = randomUUID()

  // Resolve real path once and reuse for the concurrent-file check + session row.
  const canonical = opts.sourceFile ? fs.realpathSync(opts.sourceFile) : null

  // Block concurrent sessions on the same file BEFORE any writes.
  if (canonical) {
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  // Inject the task's prep packet (if any) before persisting / spawning so
  // both the session row and the live adapter see the enriched context. The
  // helper is idempotent via the `<!-- prep:auto -->` marker, so respawn from
  // the persisted user_context will not double-inject.
  const enrichedContext = prepUserContext(db, opts.taskId, opts.userContext)
  const enrichedOpts: SpawnOptions = { ...opts, userContext: enrichedContext }

  // Persist the session row BEFORE resolveProvider — pickRoute writes a
  // routing_decisions row whose session_id FK requires this row to exist —
  // and BEFORE the adapter spawn so that, if the adapter throws, we have a
  // row to flip to 'needs_route_retry' for the UI to pick up.
  // We persist userContext / permissionMode / correctionNote so that
  // respawnSessionWithProvider can faithfully relaunch with the same inputs.
  createSession(db, {
    id: sessionId,
    projectId: opts.projectId,
    label: opts.label,
    phase: opts.phase as import('./db').SessionPhase,
    sourceFile: canonical,
    taskId: opts.taskId,
    outputPath: opts.outputPath,
    agentId: opts.agentId,
    userContext: enrichedContext,
    permissionMode: opts.permissionMode,
    correctionNote: opts.correctionNote,
  })
  logEvent(db, {
    projectId: opts.projectId,
    type: 'session_started',
    summary: `Started ${opts.phase} session: ${opts.label}`,
    severity: 'info',
  })

  const provider = await resolveProvider(db, {
    projectId: opts.projectId,
    taskId: opts.taskId,
    agentId: opts.agentId,
    phase: opts.phase as import('./db').SessionPhase,
    sessionId,
  })

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

  try {
    await spawnAdapterFor(db, sessionId, provider, enrichedOpts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(`UPDATE sessions SET status = 'needs_route_retry', exit_reason = ? WHERE id = ?`)
      .run(`adapter_spawn_failed: ${message}`, sessionId)
    // Roll back the agent state we set above; the proc.on('close') cleanup at
    // the bottom of spawnAdapterFor never fires for an early spawn failure.
    if (opts.agentId) {
      const project = getProject(db, opts.projectId)
      if (project) { try { deleteInstructions(project, provider.type) } catch {} }
      updateAgent(db, opts.agentId, { status: 'idle' })
    }
    throw err
  }

  return sessionId
}

/**
 * Spawn the provider's CLI binary for the given session row, wire up stdout/
 * stderr/close handlers, and resolve once the child process has successfully
 * started (or reject if the spawn itself failed). Shared by `spawnSession`
 * (initial launch) and `respawnSessionWithProvider` (retry with a different
 * provider).
 *
 * Pre-condition: the session row already exists in the DB. Caller is
 * responsible for flipping `status = 'needs_route_retry'` on rejection.
 */
async function spawnAdapterFor(
  db: Database,
  sessionId: string,
  provider: Provider,
  opts: SpawnOptions,
): Promise<void> {
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
    userContext: fullContext,
    permissionMode: opts.permissionMode,
    sessionId,
    providerType: provider.type,
  })

  const proc = spawn(provider.command, args, {
    cwd: opts.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Wait for either successful spawn or an error before wiring the persistent
  // handlers. This converts an async `proc.on('error')` ENOENT into a synchronous
  // rejection that `spawnSession` can catch and mark `needs_route_retry`.
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => { proc.removeListener('error', onError); resolve() }
    const onError = (err: Error) => { proc.removeListener('spawn', onSpawn); reject(err) }
    proc.once('spawn', onSpawn)
    proc.once('error', onError)
  })

  // Write session_id into source file frontmatter (best effort — frontmatter
  // is idempotent so replays during respawn don't corrupt anything).
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

  // Late spawn errors (e.g. signal mid-stream) — the early await above already
  // handles the synchronous ENOENT case.
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
    // Capture last assistant message as summary BEFORE flushSessionEvents deletes events
    captureSessionSummary(getDb(), sessionId)
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
          updateTask(getDb(), opts.taskId, { [field]: `file://${opts.outputPath}` })
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

export async function spawnOrchestratorSession(opts: {
  orchestratorId: string
  projectId: string
  projectPath: string
}): Promise<string> {
  const sessionId = randomUUID()
  const db = getDb()
  const provider = await resolveProvider(db, {
    projectId: opts.projectId,
    phase: 'orchestrator',
    sessionId,
  })

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

/**
 * Respawn a session that was put into 'needs_route_retry' using a specific provider.
 * The new routing_decisions row is written by the API handler before this call.
 *
 * Reuses the shared `spawnAdapterFor` helper so the wiring matches initial spawn.
 * On failure, flips the session back to 'needs_route_retry' so the user can
 * retry again with a different provider.
 */
export async function respawnSessionWithProvider(sessionId: string, providerId: string): Promise<void> {
  const db = getDb()
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | {
        id: string
        project_id: string
        phase: import('./db').SessionPhase
        task_id: string | null
        label: string
        source_file: string | null
        agent_id: string | null
        output_path: string | null
        user_context: string | null
        permission_mode: string | null
        correction_note: string | null
      }
    | undefined
  if (!session) throw new Error('session not found')

  const provider = getProvider(db, providerId)
  if (!provider) throw new Error('provider not found')

  const project = getProject(db, session.project_id)
  if (!project) throw new Error('project not found')

  // Restore the original spawn options from the persisted session row so the
  // retry runs with the same prompt, permission mode, and correction note as
  // the failed attempt — not a hardcoded blank prompt at default permissions.
  const opts: SpawnOptions = {
    projectId: session.project_id,
    projectPath: project.path,
    label: session.label,
    phase: session.phase as Phase,
    sourceFile: session.source_file,
    userContext: session.user_context ?? '',
    permissionMode: (session.permission_mode as SpawnOptions['permissionMode']) ?? 'default',
    correctionNote: session.correction_note ?? undefined,
    taskId: session.task_id ?? undefined,
    agentId: session.agent_id ?? undefined,
    outputPath: session.output_path ?? undefined,
  }

  try {
    await spawnAdapterFor(db, sessionId, provider, opts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    db.prepare(`UPDATE sessions SET status = 'needs_route_retry', exit_reason = ? WHERE id = ?`)
      .run(`adapter_spawn_failed: ${message}`, sessionId)
    if (opts.agentId) {
      try { deleteInstructions(project, provider.type) } catch {}
      updateAgent(db, opts.agentId, { status: 'idle' })
    }
    throw err
  }
}
