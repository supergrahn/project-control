'use client'
import { useEffect, useRef, useState } from 'react'
import type { Session } from './useSessions'

export type FeedEntry = {
  id: string
  sessionId: string
  label: string
  phase: string
  text: string
  timestamp: string
}

export function useOrchestratorFeed(sessions: Session[]) {
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const wsMap = useRef<Map<string, WebSocket>>(new Map())
  const entryCounter = useRef(0)

  useEffect(() => {
    const activeIds = new Set(sessions.map((s) => s.id))

    // Close WebSockets for sessions that are no longer active
    Array.from(wsMap.current.entries()).forEach(([id, ws]) => {
      if (!activeIds.has(id)) {
        ws.close()
        wsMap.current.delete(id)
      }
    })

    // Open WebSockets for new sessions
    for (const session of sessions) {
      if (wsMap.current.has(session.id)) continue

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`)

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type !== 'output') return
          const entry: FeedEntry = {
            id: `${session.id}-${++entryCounter.current}`,
            sessionId: session.id,
            label: session.label,
            phase: session.phase,
            text: msg.data,
            timestamp: new Date().toISOString(),
          }
          setFeed((prev) => [...prev.slice(-500), entry])
        } catch (err) {
          console.error('[OrchestratorFeed] message parse error:', err)
        }
      }

      ws.onerror = () => {
        wsMap.current.delete(session.id)
      }

      ws.onclose = () => {
        wsMap.current.delete(session.id)
      }

      wsMap.current.set(session.id, ws)
    }
  }, [sessions])

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      Array.from(wsMap.current.values()).forEach((ws) => ws.close())
      wsMap.current.clear()
    }
  }, [])

  return { feed }
}
