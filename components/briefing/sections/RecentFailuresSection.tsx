import Link from 'next/link'
import { XCircle } from 'lucide-react'
import type { BriefingRecentFailure } from '@/lib/briefing/types'

export function RecentFailuresSection({ items }: { items: BriefingRecentFailure[] }) {
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
            <li key={item.sessionId}>
              <Link
                href={`/sessions?selected=${item.sessionId}`}
                className="block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName} · {item.sessionLabel}</div>
                <div className="text-[12px] text-text-muted truncate">{item.gradeReason ?? `Grade: ${item.grade}`}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
