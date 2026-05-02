'use client'
import { useRef, useCallback } from 'react'
import { X, Minus } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'
import { useSessionTerminal } from '@/hooks/useSessionTerminal'

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
  const killSession = useKillSession()

  const { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter } =
    useSessionTerminal({ sessionId: session.id, containerRef, enabled: !minimized })

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
