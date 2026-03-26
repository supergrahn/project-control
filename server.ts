import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { handleWebSocket } from './lib/session-manager'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev, turbo: dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
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
      socket.destroy()
    }
  })

  // Kill all PTYs on shutdown
  const { ptyMap } = require('./lib/session-manager')
  const shutdown = () => {
    for (const proc of (ptyMap as Map<string, any>).values()) {
      try { proc.kill() } catch {}
    }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  server.listen(3000, () => {
    console.log('> Ready on http://localhost:3000')
  })
})
