// server/orchestrator-mcp.ts
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { randomUUID, randomBytes } from 'crypto'
import { z } from 'zod'
import * as tools from './orchestrator-tools'

const SECRET = process.env.ORCHESTRATOR_MCP_SECRET || randomBytes(32).toString('hex')

/** Exposed so spawnOrchestratorSession can pass the same secret to the Claude session */
export function getMcpSecret(): string { return SECRET }

function checkAuth(req: IncomingMessage): boolean {
  return req.headers['x-orchestrator-secret'] === SECRET
}

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: 'orchestrator-mcp', version: '1.0.0' })

  server.tool('list_sessions', { project_id: z.string() }, async ({ project_id }) =>
    ({ content: [{ type: 'text' as const, text: JSON.stringify(await tools.listSessionsByProject(project_id)) }] })
  )

  server.tool('read_artifact', { source_file: z.string() }, async ({ source_file }) =>
    ({ content: [{ type: 'text' as const, text: await tools.readArtifact(source_file) }] })
  )

  server.tool('read_progress', { session_id: z.string() }, async ({ session_id }) =>
    ({ content: [{ type: 'text' as const, text: JSON.stringify(await tools.readProgress(session_id)) }] })
  )

  server.tool('spawn_session', { project_id: z.string(), phase: z.string(), source_file: z.string().optional() }, async ({ project_id, phase, source_file }) =>
    ({ content: [{ type: 'text' as const, text: JSON.stringify({ sessionId: await tools.spawnNewSession(project_id, phase, source_file) }) }] })
  )

  server.tool('advance_phase', { session_id: z.string() }, async ({ session_id }) => {
    await tools.advancePhase(session_id)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })

  server.tool('pause_session', { session_id: z.string(), reason: z.string() }, async ({ session_id, reason }) => {
    await tools.pauseSession(session_id, reason)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })

  server.tool('propose_actions', {
    session_id: z.string(),
    actions: z.array(z.object({ label: z.string(), action_type: z.string(), payload: z.string().optional() })),
  }, async ({ session_id, actions }) => {
    await tools.proposeActions(session_id, actions)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })

  server.tool('log_decision', {
    orchestrator_id: z.string(),
    project_id: z.string(),
    source_file: z.string().optional(),
    summary: z.string(),
    detail: z.string().optional(),
    severity: z.enum(['info', 'warn', 'override']),
  }, async (input) => {
    await tools.logDecision(input)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })

  server.tool('notify', { channel: z.string(), message: z.string() }, async ({ channel, message }) => {
    await tools.sendNotification(channel, message)
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })

  return server
}

export function startOrchestratorMcp(port: number): ReturnType<typeof createServer> {
  const mcpServer = buildMcpServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  mcpServer.connect(transport)

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!checkAuth(req)) {
      res.writeHead(401).end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }
    if (req.url === '/mcp') {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', async () => {
        const raw = Buffer.concat(chunks).toString()
        let body: unknown
        try { body = raw ? JSON.parse(raw) : undefined } catch { body = undefined }
        try {
          await transport.handleRequest(req, res, body)
        } catch (err) {
          if (!res.headersSent) res.writeHead(500).end(JSON.stringify({ error: String(err) }))
        }
      })
    } else {
      res.writeHead(404).end()
    }
  })

  httpServer.listen(port, () => {
    console.log(`[orchestrator-mcp] listening on :${port}`)
    if (!process.env.ORCHESTRATOR_MCP_SECRET) {
      console.log(`[orchestrator-mcp] generated secret: ${SECRET}`)
    }
  })
  return httpServer
}
