import { useState } from 'react'
import Link from 'next/link'
import { Copy } from 'lucide-react'
import type { BriefingDuplicate } from '@/lib/briefing/types'

type Props = {
  items: BriefingDuplicate[]
  onAction?: (item: BriefingDuplicate) => void | Promise<void>
}

export function DuplicateTasksSection({ items, onAction }: Props) {
  const [pending, setPending] = useState(false)

  async function handleAction(e: React.MouseEvent, item: BriefingDuplicate) {
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
        <Copy size={14} className="text-text-secondary" /> Possible duplicates
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No likely duplicate tasks detected.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <Link
                href={`/projects/${item.projectId}/ideas`}
                className="flex-1 block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline min-w-0"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName}</div>
                <div className="text-[12px] text-text-muted truncate">
                  {item.aTitle} ↔ {item.bTitle} ({(item.similarity * 100).toFixed(0)}%)
                </div>
              </Link>
              {onAction && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={e => handleAction(e, item)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-[6px] border border-border-default bg-bg-secondary px-2.5 py-1 text-[11px] text-text-secondary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
