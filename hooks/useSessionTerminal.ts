'use client'
import { useEffect, useRef, useState } from 'react'
import type { SessionState } from '@/components/sessions/SessionStatusBanner'

export type TermStatus = 'active' | 'ended' | 'connecting'

export type SessionTerminalState = {
  termStatus: TermStatus
  sessionState: SessionState
  sessionReason: string | undefined
  sessionMessage: string | undefined
  sessionProvider: string | undefined
  retryAfter: number | undefined
}

type Opts = {
  sessionId: string
  containerRef: React.RefObject<HTMLDivElement | null>
  enabled: boolean
}

function deriveTermStatus(state: SessionState): TermStatus {
  if (state === 'active') return 'active'
  if (state === 'ended') return 'ended'
  return 'connecting'
}

export function useSessionTerminal({ sessionId, containerRef, enabled }: Opts): SessionTerminalState {
  const [sessionState, setSessionState] = useState<SessionState>('active')
  const [sessionReason, setSessionReason] = useState<string | undefined>()
  const [sessionMessage, setSessionMessage] = useState<string | undefined>()
  const [sessionProvider, setSessionProvider] = useState<string | undefined>()
  const [retryAfter, setRetryAfter] = useState<number | undefined>()
  const [errorEnded, setErrorEnded] = useState(false)
  // True only after we've received a `status` message from the server. Until then,
  // termStatus stays `'connecting'` even after WS open — preserving the original
  // FloatingSessionWindow behavior where the green dot didn't appear until the
  // server confirmed the session state.
  const [hasReceivedStatus, setHasReceivedStatus] = useState(false)

  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    if (!enabled || !containerRef.current) return
    let cancelled = false
    setErrorEnded(false)
    setHasReceivedStatus(false)

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled) return

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#a78bfa' },
        fontSize: 13,
        fontFamily: 'var(--font-mono)',
        cursorBlink: true,
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(containerRef.current!)
      termRef.current = term

      await new Promise((r) => requestAnimationFrame(r))
      if (cancelled) { term.dispose(); termRef.current = null; return }
      fit.fit()

      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      )
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId }))
      }

      ws.onerror = () => setErrorEnded(true)

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') term.write(msg.data + '\r\n')
          if (msg.type === 'status') {
            setSessionState(msg.state as SessionState)
            setSessionReason(msg.reason)
            setSessionMessage(msg.message)
            setSessionProvider(msg.provider)
            setRetryAfter(msg.retryAfter)
            setHasReceivedStatus(true)
          }
        } catch {}
      }

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      term.onResize(() => {
        // Pipe-based sessions do not support resize — no-op
      })

      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(containerRef.current!)
      observerRef.current = observer
    }

    init()

    return () => {
      cancelled = true
      wsRef.current?.close()
      wsRef.current = null
      termRef.current?.dispose()
      termRef.current = null
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [sessionId, enabled, containerRef])

  // Derived termStatus: errorEnded > hasReceivedStatus gate > sessionState mapping
  const termStatus: TermStatus = errorEnded
    ? 'ended'
    : !hasReceivedStatus
      ? 'connecting'
      : deriveTermStatus(sessionState)

  return { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter }
}
