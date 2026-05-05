import { useState } from 'react'
import Link from 'next/link'
import { CheckSquare } from 'lucide-react'
import type { BriefingTopTask } from '@/lib/briefing/types'

function statusToRoute(status: string): string {
  if (status === 'spec') return 'specs'
  if (status === 'plan') return 'plans'
  return 'ideas'
}

type Props = {
  items: BriefingTopTask[]
  onAction?: (taskId: string) => void | Promise<void>
}

export function TopTasksSection({ items, onAction }: Props) {
  const [pending, setPending] = useState(false)

  async function handleAction(e: React.MouseEvent, taskId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!onAction || pending) return
    setPending(true)
    try {
      await onAction(taskId)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="bg-bg-primary border border-border-default rounded-lg p-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
        <CheckSquare size={14} className="text-accent-green" /> Tasks worth picking up
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No tasks waiting for work.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li key={item.taskId} className="flex items-center gap-2">
              <Link
                href={`/projects/${item.projectId}/${statusToRoute(item.status)}`}
                className="flex-1 block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline min-w-0"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName}</div>
                <div className="text-[12px] text-text-muted truncate">{item.title}</div>
              </Link>
              {onAction && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={e => handleAction(e, item.taskId)}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-2.5 py-1 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start →
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
