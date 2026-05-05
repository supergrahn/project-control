import Link from 'next/link'
import { ListChecks } from 'lucide-react'
import type { BriefingNextAction } from '@/lib/briefing/types'

export function OpenNextActionsSection({ items }: { items: BriefingNextAction[] }) {
  return (
    <section className="bg-bg-primary border border-border-default rounded-lg p-4">
      <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
        <ListChecks size={14} className="text-accent-blue" /> Open next steps
      </h2>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">No open next steps in the last 14 days.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(item => (
            <li key={item.sessionId}>
              <Link href={`/sessions?selected=${item.sessionId}`} className="block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline">
                <div className="text-[12px] text-text-secondary">{item.projectName} · {item.sessionLabel}</div>
                <div className="text-[12px] text-text-muted truncate">{item.actions[0] ?? item.openQuestions[0] ?? '(no actions)'}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
