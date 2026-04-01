'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Minus } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { SessionStatusBanner, type SessionState } from '@/components/sessions/SessionStatusBanner'

export type WindowState = {
  session: Session
  x: number
  y: number
  width: number
  height: number
  minimized: boolean
  zIndex: number
}

type Props = {
  state: WindowState
  onClose: (sessionId: string) => void
  onMinimize: (sessionId: string) => void
  onBringToFront: (sessionId: string) => void
  onPositionChange: (sessionId: string, x: number, y: number) => void
}

export function FloatingSessionWindow({ state, onClose, onMinimize, onBringToFront, onPositionChange }: Props) {
  const { session, x, y, width, height, minimized, zIndex } = state
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [termStatus, setTermStatus] = useState<'active' | 'ended' | 'connecting'>('connecting')
  const [sessionState, setSessionState] = useState<SessionState>('active')
  const [sessionReason, setSessionReason] = useState<string | undefined>()
  const [sessionMessage, setSessionMessage] = useState<string | undefined>()
  const [sessionProvider, setSessionProvider] = useState<string | undefined>()
  const [retryAfter, setRetryAfter] = useState<number | undefined>()
  const killSession = useKillSession()

  // Drag handling
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onBringToFront(session.id)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y }

    const onMove = (me: MouseEvent) => {
      if (!dragRef.current) return
      const nx = dragRef.current.origX + me.clientX - dragRef.current.startX
      const ny = dragRef.current.origY + me.clientY - dragRef.current.startY
      onPositionChange(session.id, nx, ny)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [session.id, x, y, onBringToFront, onPositionChange])

  useEffect(() => {
    if (minimized || !containerRef.current) return
    let cancelled = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled) return

      const term = new Terminal({
        theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#a78bfa' },
        fontSize: 13,
        fontFamily: 'ui-monospace, monospace',
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
        ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
      }

      ws.onerror = () => setTermStatus('ended')

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') term.write(msg.data + '\r\n')
          if (msg.type === 'status') {
            setTermStatus(msg.state)
            setSessionState(msg.state as SessionState)
            setSessionReason(msg.reason)
            setSessionMessage(msg.message)
            setSessionProvider(msg.provider)
            setRetryAfter(msg.retryAfter)
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

    setTermStatus('connecting')
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
  }, [session.id, minimized])

  if (minimized) return null

  return (
    <div
      style={{ left: x, top: y, width, height, zIndex, resize: 'both' as React.CSSProperties['resize'], overflow: 'auto' }}
      className="fixed flex flex-col bg-bg-base border border-border-strong rounded-lg shadow-2xl"
      onMouseDown={() => onBringToFront(session.id)}
    >
      {/* Status banner */}
      <SessionStatusBanner
        state={sessionState}
        reason={sessionReason}
        message={sessionMessage}
        provider={sessionProvider}
        retryAfter={retryAfter}
      />

      {/* Title bar / drag handle */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex items-center gap-2 px-3 py-2 border-b border-border-default shrink-0 cursor-move select-none"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${termStatus === 'active' ? 'bg-accent-green' : termStatus === 'ended' ? 'bg-text-faint' : 'bg-accent-orange'}`} />
        <span className="text-xs font-medium text-text-primary flex-1 truncate">{session.label}</span>
        <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => onMinimize(session.id)}
            className="p-1 text-text-muted hover:text-text-primary rounded hover:bg-bg-secondary"
            title="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => {
              if (termStatus === 'active' || sessionState === 'unresponsive') killSession.mutate(session.id)
              onClose(session.id)
            }}
            className="p-1 text-text-muted hover:text-accent-red rounded hover:bg-bg-secondary"
            title="Close session"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 p-1.5 min-h-0" />
    </div>
  )
}
