import Link from 'next/link'
import { Copy } from 'lucide-react'
import type { BriefingDuplicate } from '@/lib/briefing/types'

export function DuplicateTasksSection({ items }: { items: BriefingDuplicate[] }) {
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
            <li key={idx}>
              <Link
                href={`/projects/${item.projectId}/ideas`}
                className="block hover:bg-bg-secondary rounded px-2 py-1.5 -mx-2 no-underline"
              >
                <div className="text-[12px] text-text-secondary">{item.projectName}</div>
                <div className="text-[12px] text-text-muted truncate">
                  {item.aTitle} ↔ {item.bTitle} ({(item.similarity * 100).toFixed(0)}%)
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
