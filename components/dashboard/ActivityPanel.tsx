'use client'
import Link from 'next/link'
import type { Task } from '@/lib/db/tasks'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'

type ActionItem = {
  taskId: string
  title: string
  tag: string
  tagColor: string
  href: string
}

function deriveActions(tasks: Task[]): ActionItem[] {
  const actions: ActionItem[] = []
  for (const t of tasks) {
    if (t.status === 'planning' && t.plan_file) {
      actions.push({
        taskId: t.id, title: t.title,
        tag: 'Plan ready', tagColor: '#8f77c9',
        href: `/projects/${t.project_id}/plans`,
      })
    }
  }
  return actions
}

type Props = { tasks: Task[]; feed: FeedEntry[] }

export function ActivityPanel({ tasks, feed }: Props) {
  const actions = deriveActions(tasks)
  const sortedFeed = [...feed].reverse()

  return (
    <div className="w-62 flex-shrink-0 bg-bg-base border-l border-border-default flex flex-col h-full overflow-hidden">
      {/* Actions Required */}
      <div className="px-3.5 py-3.5 pb-2 border-b border-border-default flex-shrink-0">
        <div className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2.5">
          Actions Required
        </div>
        {actions.length === 0 ? (
          <div className="text-text-disabled text-sm">No actions required</div>
        ) : (
          actions.map(a => (
            <Link key={a.taskId} href={a.href} className="no-underline">
              <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-bg-secondary border border-border-subtle mb-1.5 cursor-pointer hover:border-border-hover">
                <span className="text-gray-300 text-sm overflow-hidden text-ellipsis whitespace-nowrap flex-1">{a.title}</span>
                <span
                  className="rounded text-xs font-semibold flex-shrink-0 ml-1.5 px-1.5 py-0.5"
                  style={{
                    background: a.tagColor + '22',
                    color: a.tagColor,
                  }}
                >
                  {a.tag}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Live Feed */}
      <div className="flex-1 overflow-y-auto p-3.5">
        <div className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-2.5">
          Live Feed
        </div>
        {sortedFeed.length === 0 ? (
          <div className="text-text-disabled text-sm">No activity yet</div>
        ) : (
          <ul className="list-none m-0 p-0">
            {sortedFeed.slice(0, 100).map(entry => {
              const initials = PHASE_INITIALS[entry.phase] ?? entry.phase.slice(0, 2).toUpperCase()
              const age = formatAge(entry.timestamp)
              return (
                <li key={entry.id} className="flex gap-2 items-start mb-2">
                  <div className="w-5 h-5 rounded-full bg-accent-blue/15 flex-shrink-0 flex items-center justify-center text-accent-blue text-xs font-bold">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-text-muted text-xs mb-0.5">{age}</div>
                    <div className="text-text-secondary text-xs font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                      {entry.text}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
