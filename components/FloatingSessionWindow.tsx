'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Minus } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'

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
          if (msg.type === 'output') term.write(msg.data)
          if (msg.type === 'status') setTermStatus(msg.state)
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
      className="fixed flex flex-col bg-zinc-950 border border-zinc-700 rounded-lg shadow-2xl"
      onMouseDown={() => onBringToFront(session.id)}
    >
      {/* Title bar / drag handle */}
      <div
        onMouseDown={onTitleMouseDown}
        className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0 cursor-move select-none"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${termStatus === 'active' ? 'bg-emerald-400' : termStatus === 'ended' ? 'bg-zinc-600' : 'bg-yellow-400'}`} />
        <span className="text-xs font-medium text-zinc-300 flex-1 truncate">{session.label}</span>
        <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => onMinimize(session.id)}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800"
            title="Minimize"
          >
            <Minus size={12} />
          </button>
          <button
            onClick={() => {
              if (termStatus === 'active') killSession.mutate(session.id)
              onClose(session.id)
            }}
            className="p-1 text-zinc-500 hover:text-red-400 rounded hover:bg-zinc-800"
            title="Close session"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {termStatus === 'ended' && (
        <div className="bg-zinc-800/50 text-zinc-400 text-[10px] text-center py-1 shrink-0">
          Session ended — read-only
        </div>
      )}

      <div ref={containerRef} className="flex-1 p-1.5 min-h-0" />
    </div>
  )
}
