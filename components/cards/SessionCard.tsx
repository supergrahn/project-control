'use client'
import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'

type Props = {
  session: Session
  onOpen: () => void
  onStop: () => void
}

export function SessionCard({ session, onOpen, onStop }: Props) {
  const [preview, setPreview] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`)
    wsRef.current = ws
    ws.onopen = () => ws.send(JSON.stringify({ type: 'attach', sessionId: session.id }))
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'output') {
          setPreview((prev) => {
            const lines = (prev + msg.data).split('\n')
            return lines.slice(-3).join('\n')
          })
        }
      } catch {}
    }
    return () => ws.close()
  }, [session.id])

  return (
    <div className="bg-bg-primary border border-accent-green/30 rounded-lg overflow-hidden flex flex-col">
      <div className="bg-accent-green/10 border-b border-accent-green/30 px-4 py-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_theme(colors.emerald.400)]" />
        <span className="text-accent-green text-xs font-semibold uppercase tracking-wide">Active</span>
        <span className="ml-auto text-text-muted text-xs">{formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}</span>
      </div>
      <div className="p-4 flex-1">
        <p className="text-sm font-semibold text-text-primary mb-1">{session.label}</p>
        <p className="text-xs text-text-muted mb-3 capitalize">{session.phase}</p>
        <div className="bg-bg-base rounded p-2 h-10 overflow-hidden font-mono text-[10px] text-accent-green leading-relaxed">
          {preview || <span className="text-text-faint">Waiting for output...</span>}
        </div>
      </div>
      <div className="border-t border-border-default bg-bg-base px-3 py-2 flex gap-2">
        <button onClick={onOpen} className="text-xs px-2.5 py-1 bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 rounded">Open →</button>
        <button onClick={onStop} className="text-xs px-2.5 py-1 bg-accent-red/10 text-accent-red hover:bg-accent-red/20 rounded flex items-center gap-1"><Square size={10} /> Stop</button>
      </div>
    </div>
  )
}
