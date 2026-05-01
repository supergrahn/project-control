'use client'
import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Square } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@/hooks/useSessions'
import { useRouterDecision } from '@/hooks/useRouterDecision'
import { RouteRetryDialog } from '@/components/router/RouteRetryDialog'

type Props = {
  session: Session
  onOpen: () => void
  onStop: () => void
}

export function SessionCard({ session, onOpen, onStop }: Props) {
  const [preview, setPreview] = useState<string>('')
  const [retryOpen, setRetryOpen] = useState(true)
  const wsRef = useRef<WebSocket | null>(null)
  const qc = useQueryClient()
  const { data: routerData } = useRouterDecision(session.id)
  const decision = routerData?.decision ?? null
  // `manual_retry` decisions don't have a considered list; the badge only
  // makes sense for auto-routed sessions.
  const considered = decision?.score_breakdown?.considered

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

  const isAwaitingRetry = session.status === 'needs_route_retry'

  return (
    <div
      className={`bg-bg-primary border rounded-lg overflow-hidden flex flex-col ${
        isAwaitingRetry ? 'border-accent-red/40' : 'border-accent-green/30'
      }`}
    >
      <div
        className={`px-4 py-2 flex items-center gap-2 border-b ${
          isAwaitingRetry
            ? 'bg-accent-red/10 border-accent-red/30'
            : 'bg-accent-green/10 border-accent-green/30'
        }`}
      >
        {isAwaitingRetry ? (
          <>
            <span className="w-2 h-2 rounded-full bg-accent-red" />
            <span className="text-accent-red text-xs font-semibold uppercase tracking-wide">Needs retry</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_theme(colors.emerald.400)]" />
            <span className="text-accent-green text-xs font-semibold uppercase tracking-wide">Active</span>
          </>
        )}
        {decision && considered && considered.length > 0 && (
          <div className="relative group">
            <span className="text-[10px] uppercase tracking-wider text-text-faint border border-border-default rounded px-1.5 py-0.5">
              via router
            </span>
            <div className="absolute hidden group-hover:block z-10 top-full left-0 mt-1 w-64 bg-bg-secondary border border-border-default rounded-[6px] p-2 shadow-lg">
              <div className="text-[10px] uppercase text-text-faint mb-1">Considered</div>
              <ol className="text-xs text-text-primary space-y-0.5">
                {considered.map((r) => (
                  <li
                    key={r.providerId}
                    className={r.providerId === decision.picked_provider ? 'font-semibold text-accent-blue' : ''}
                  >
                    {r.providerName} <span className="text-text-muted">{r.score.toFixed(2)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
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
      {isAwaitingRetry && decision && considered && retryOpen && (
        <RouteRetryDialog
          open
          sessionId={session.id}
          errorMessage={session.exit_reason ?? 'Session start failed.'}
          decision={decision}
          onClose={() => setRetryOpen(false)}
          onRetried={() => {
            setRetryOpen(false)
            qc.invalidateQueries({ queryKey: ['router-decision', session.id] })
            qc.invalidateQueries({ queryKey: ['sessions'] })
          }}
        />
      )}
    </div>
  )
}
