import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { BriefingCriticFlag } from '@/lib/briefing/types'

type Props = {
  items: BriefingCriticFlag[]
  onAction?: (item: BriefingCriticFlag) => void | Promise<void>
}

export function CriticFlaggedSection({ items, onAction }: Props) {
  const [pending, setPending] = useState(false)

  async function handleAction(e: React.MouseEvent, item: BriefingCriticFlag) {
    e.preventDefault()
    e.stopPropagation()
    if (!onAction || pending) return
    setPending(true)
    try {
      await onAction(item)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="bg-bg-primary border border-border-default rounded-lg p-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
        <AlertTriangle size={14} className="text-accent-orange" /> Critic flagged
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No critical critic findings.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <Link
                href={`/projects/${item.projectId}/${item.kind === 'plan' ? 'plans' : 'specs'}`}
                className="flex-1 block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline min-w-0"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      item.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'
                    }`}
                  />
                  <div className="text-[12px] text-text-secondary truncate">{item.projectName} · {item.ref}</div>
                </div>
                <div className="text-[12px] text-text-muted truncate ml-3.5">{item.message}</div>
              </Link>
              {onAction && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={e => handleAction(e, item)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-2.5 py-1 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Fix this →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
