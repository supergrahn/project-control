import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleWebSocket } from './lib/session-manager'
import { handleTimeballoonSocket } from './lib/timeballoon-sync-bus'
import { checkWsToken } from './lib/timeballoon-auth'
import { startOrchestratorMcp } from './server/orchestrator-mcp'
import { startOrchestratorWatcher } from './server/orchestrator-watcher'
import { startAllPolling, stopAllPolling } from './lib/taskSources/pollManager'

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

  // Separate WebSocketServer instance for TimeBalloon clients so their
  // attach/input protocol doesn't bleed into ours.
  const tbWss = new WebSocketServer({ noServer: true })
  tbWss.on('connection', (ws) => handleTimeballoonSocket(ws))

  server.on('upgrade', (req, socket, head) => {
    const parsed = parse(req.url!)
    const pathname = parsed.pathname
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else if (pathname === '/ws/timeballoon') {
      // Bearer token lives in the query string because browsers / Tauri can't
      // set headers on WS upgrade. Reject pre-handshake on bad/missing token
      // so the listener never sees unauthenticated sockets.
      if (!checkWsToken(parsed.search ?? '')) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      tbWss.handleUpgrade(req, socket, head, (ws) => {
        tbWss.emit('connection', ws, req)
      })
    } else {
      // Pass all other upgrade requests (/_next/webpack-hmr, etc.) to Next.js
      nextUpgrade(req, socket, head)
    }
  })

  const shutdown = () => {
    stopAllPolling()
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
