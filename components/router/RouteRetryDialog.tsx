'use client'
import { useState } from 'react'

type ConsideredRoute = { providerId: string; providerName: string; score: number }
type Decision = {
  picked_provider: string
  score_breakdown: {
    considered: ConsideredRoute[]
  }
}

type Props = {
  open: boolean
  sessionId: string
  errorMessage: string
  decision: Decision
  onClose: () => void
  onRetried: () => void
}

export function RouteRetryDialog({
  open,
  sessionId,
  errorMessage,
  decision,
  onClose,
  onRetried,
}: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  if (!open) return null

  const alternatives = decision.score_breakdown.considered
    .filter((r) => r.providerId !== decision.picked_provider)
    .slice(0, 5)

  async function pick(providerId: string) {
    setSubmitting(providerId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/restart-with-route`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId }),
      })
      if (!res.ok) throw new Error(`restart failed: ${res.status}`)
      onRetried()
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-bg-overlay flex items-center justify-center z-50"
      onMouseDown={onClose}
    >
      <div
        className="bg-bg-primary border border-border-default rounded-[8px] p-6 w-[480px] max-w-[90vw] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-text-primary text-base font-semibold mb-2">Session start failed</h2>
        <p className="text-text-secondary text-sm mb-4 font-mono break-all">{errorMessage}</p>
        <div className="text-[11px] uppercase tracking-[0.04em] text-text-faint mb-2">Alternatives</div>
        <div className="space-y-2 mb-4">
          {alternatives.map((r) => (
            <button
              key={r.providerId}
              type="button"
              onClick={() => pick(r.providerId)}
              disabled={submitting !== null}
              className="w-full text-left px-3 py-2 rounded-[6px] bg-bg-secondary hover:bg-bg-tertiary text-text-primary disabled:opacity-50"
            >
              <span className="font-medium">{r.providerName}</span>
              <span className="ml-2 text-text-muted text-xs">score {r.score.toFixed(2)}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
