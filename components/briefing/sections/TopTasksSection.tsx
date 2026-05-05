import Link from 'next/link'
import { CheckSquare } from 'lucide-react'
import type { BriefingTopTask } from '@/lib/briefing/types'

function statusToRoute(status: string): string {
  if (status === 'spec') return 'specs'
  if (status === 'plan') return 'plans'
  return 'ideas'
}

export function TopTasksSection({ items }: { items: BriefingTopTask[] }) {
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
            <li key={item.taskId}>
              <Link
                href={`/projects/${item.projectId}/${statusToRoute(item.status)}`}
                className="block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName}</div>
                <div className="text-[12px] text-text-muted truncate">{item.title}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
