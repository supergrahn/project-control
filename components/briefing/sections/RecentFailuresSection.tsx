import { useState } from 'react'
import Link from 'next/link'
import { XCircle } from 'lucide-react'
import type { BriefingRecentFailure } from '@/lib/briefing/types'

type Props = {
  items: BriefingRecentFailure[]
  onAction?: (sessionId: string) => void | Promise<void>
}

export function RecentFailuresSection({ items, onAction }: Props) {
  const [pending, setPending] = useState(false)

  async function handleAction(e: React.MouseEvent, sessionId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!onAction || pending) return
    setPending(true)
    try {
      await onAction(sessionId)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="bg-bg-primary border border-border-default rounded-lg p-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
        <XCircle size={14} className="text-accent-red" /> Recent failures
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No graded failures in the last 7 days.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li key={item.sessionId} className="flex items-center gap-2">
              <Link
                href={`/sessions?selected=${item.sessionId}`}
                className="flex-1 block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline min-w-0"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName} · {item.sessionLabel}</div>
                <div className="text-[12px] text-text-muted truncate">{item.gradeReason ?? `Grade: ${item.grade}`}</div>
              </Link>
              {onAction && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={e => handleAction(e, item.sessionId)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-2.5 py-1 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
