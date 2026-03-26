'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'

type Props = {
  session: Session | null
  onClose: () => void
}

export function SessionModal({ session, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [status, setStatus] = useState<'active' | 'ended' | 'connecting'>('connecting')
  const killSession = useKillSession()

  useEffect(() => {
    if (!session || !containerRef.current) return

    let cancelled = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (cancelled) return  // check after first await

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
      if (cancelled) { term.dispose(); termRef.current = null; return }  // check after second await
      fit.fit()

      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
      )
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'attach', sessionId: currentSession.id }))
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'output') term.write(msg.data)
          if (msg.type === 'status') setStatus(msg.state)
        } catch {}
      }

      term.onData((data: string) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }))
      })

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows }))
      })

      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(containerRef.current!)
      observerRef.current = observer
    }

    const currentSession = session  // capture non-null value
    setStatus('connecting')
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
  }, [session?.id])

  if (!session) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-400' : status === 'ended' ? 'bg-zinc-600' : 'bg-yellow-400'}`} />
        <span className="text-sm font-medium text-zinc-200">{session.label}</span>
        <span className="text-xs text-zinc-500 capitalize">{status}</span>
        <div className="ml-auto flex gap-2">
          {status === 'active' && (
            <button onClick={() => killSession.mutate(session.id)} className="flex items-center gap-1.5 text-xs px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded">
              <Square size={12} /> Stop Session
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-100 rounded hover:bg-zinc-800"><X size={18} /></button>
        </div>
      </div>

      {status === 'ended' && (
        <div className="bg-zinc-800/50 text-zinc-400 text-xs text-center py-2">
          Session ended — output above is read-only
        </div>
      )}

      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  )
}
