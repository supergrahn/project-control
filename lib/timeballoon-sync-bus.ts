// Broadcast bus for /ws/timeballoon. Mirrors the lib/session-manager.ts
// broadcast pattern but lives in its own module so the Mac's TimeBalloon app
// and project-control's internal session WS don't share clients.
//
// Phase 2 only needs broadcast() — the only sender is the sync route handler.
// Phase 5 (web view) might add per-client filtering, but for now every
// connected TimeBalloon client receives every event.

import { WebSocket } from 'ws'

declare global {
  // eslint-disable-next-line no-var
  var __tbClients: Set<WebSocket> | undefined
}

globalThis.__tbClients ??= new Set<WebSocket>()
const clients: Set<WebSocket> = globalThis.__tbClients

export function registerTimeballoonClient(ws: WebSocket): void {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  // Hello packet so the Mac knows the WS is alive (otherwise it's silent until
  // the first sync event). Stays as `{type:'hello'}` so future protocol
  // additions are backward-compatible.
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'hello', ts: new Date().toISOString() }))
  }
}

export function broadcastTimeballoon(msg: Record<string, unknown>): void {
  const json = JSON.stringify(msg)
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(json)
  }
}

export function timeballoonClientCount(): number {
  return clients.size
}

/** WS connection handler. Called from server.ts after auth + upgrade. */
export function handleTimeballoonSocket(ws: WebSocket): void {
  registerTimeballoonClient(ws)
  ws.on('message', () => {
    // Phase 2 ignores client messages — the protocol is server-push only.
    // Keep the listener so the socket doesn't drop on inbound pings later.
  })
}
