import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleWebSocket } from './lib/session-manager'
import { startOrchestratorMcp } from './server/orchestrator-mcp'
import { startOrchestratorWatcher } from './server/orchestrator-watcher'
import { startAllPolling, stopAllPolling } from './lib/taskSources/pollManager'
import { startScheduler } from './lib/jobs/runner'
import { registerAllHandlers } from './lib/jobs/registerAll'
import { JOB_CONFIG } from './lib/jobs/config'
import { getDb } from './lib/db'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, turbo: dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const nextUpgrade = app.getUpgradeHandler()
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const wss = new WebSocketServer({ noServer: true })
  wss.on('connection', handleWebSocket)

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!)
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      // Pass all other upgrade requests (/_next/webpack-hmr, etc.) to Next.js
      nextUpgrade(req, socket, head)
    }
  })

  // Reflective-workflow scheduler: register handlers and start the tick loop.
  // Skipped under tests; guarded by a globalThis singleton so HMR/dev reloads
  // don't double-start it.
  let schedulerHandle: { stop: () => void } | null = null
  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    const g = globalThis as unknown as { __reflectiveSchedulerStarted?: boolean }
    if (!g.__reflectiveSchedulerStarted) {
      g.__reflectiveSchedulerStarted = true
      registerAllHandlers()
      schedulerHandle = startScheduler({ ...JOB_CONFIG, getDb })
      console.log('[jobs] scheduler started')
    }
  }

  const shutdown = () => {
    stopAllPolling()
    schedulerHandle?.stop()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  const port = parseInt(process.env.PORT ?? '3000', 10)
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`)
  })

  const mcpPort = parseInt(process.env.ORCHESTRATOR_MCP_PORT ?? '3002', 10)
  startOrchestratorMcp(mcpPort)
  startOrchestratorWatcher()
  startAllPolling()
})
