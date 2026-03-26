import * as pty from 'node-pty'
import { WebSocket } from 'ws'
import { execSync } from 'child_process'
import fs from 'fs'
import { getDb, createSession, endSession, getActiveSessionForFile } from './db'
import { buildArgs, getSystemPrompt, Phase, PermissionMode } from './prompts'
import { randomUUID } from 'crypto'

// --- PTY maps (survive Next.js hot-reload via globalThis) ---
declare global {
  var ptyMap: Map<string, pty.IPty>
  var wsMap: Map<string, Set<WebSocket>>
  var outputBuffer: Map<string, string[]>
}
globalThis.ptyMap ??= new Map()
globalThis.wsMap ??= new Map()
globalThis.outputBuffer ??= new Map()

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

const CLAUDE_BIN = resolveClaude()

// --- Session spawning ---
export type SpawnOptions = {
  projectId: string
  projectPath: string
  label: string
  phase: Phase
  sourceFile: string | null
  userContext: string
  permissionMode: PermissionMode
}

export function spawnSession(opts: SpawnOptions): string {
  const db = getDb()
  const sessionId = randomUUID()

  // Block concurrent sessions on the same file
  if (opts.sourceFile) {
    const canonical = fs.realpathSync(opts.sourceFile)
    const existing = getActiveSessionForFile(db, canonical)
    if (existing) throw new Error(`CONCURRENT_SESSION:${existing.id}`)
  }

  const systemPrompt = opts.sourceFile
    ? getSystemPrompt(opts.phase, opts.sourceFile)
    : `You are helping with a ${opts.phase} session.`

  const args = buildArgs({
    systemPrompt,
    userContext: opts.userContext,
    permissionMode: opts.permissionMode,
    sessionId,
  })

  const proc = pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: opts.projectPath,
    env: { ...process.env },
  })

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

  const canonical = opts.sourceFile ? fs.realpathSync(opts.sourceFile) : null
  try {
    createSession(db, {
      id: sessionId,
      projectId: opts.projectId,
      label: opts.label,
      phase: opts.phase,
      sourceFile: canonical,
    })
  } catch (err) {
    try { proc.kill() } catch {}
    throw err
  }

  ptyMap.set(sessionId, proc)
  wsMap.set(sessionId, new Set())
  outputBuffer.set(sessionId, [])

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
