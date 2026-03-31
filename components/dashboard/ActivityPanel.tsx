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
    } else if (t.status === 'developing' && !t.plan_file) {
      // developing with no plan on file — nudge user to check output
    }
  }
  return actions
}

type Props = { tasks: Task[]; feed: FeedEntry[] }

export function ActivityPanel({ tasks, feed }: Props) {
  const actions = deriveActions(tasks)
  const sortedFeed = [...feed].reverse()

  const panel: React.CSSProperties = {
    width: 248, flexShrink: 0, background: '#0c0e10',
    borderLeft: '1px solid #1c1f22', display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
  }

  return (
    <div style={panel}>
      {/* Actions Required */}
      <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid #1c1f22', flexShrink: 0 }}>
        <div style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Actions Required
        </div>
        {actions.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 12 }}>No actions required</div>
        ) : (
          actions.map(a => (
            <Link key={a.taskId} href={a.href} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: '#141618', border: '1px solid #1e2124', marginBottom: 6, cursor: 'pointer' }}>
                <span style={{ color: '#c8ced6', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{a.title}</span>
                <span style={{ background: a.tagColor + '22', color: a.tagColor, borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>
                  {a.tag}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Live Feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ color: '#8a9199', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          Live Feed
        </div>
        {sortedFeed.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 12 }}>No activity yet</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sortedFeed.slice(0, 100).map(entry => {
              const initials = PHASE_INITIALS[entry.phase] ?? entry.phase.slice(0, 2).toUpperCase()
              const age = formatAge(entry.timestamp)
              return (
                <li key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#1a2530', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#5b9bd5', fontSize: 8, fontWeight: 700,
                  }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#5a6370', fontSize: 10, marginBottom: 2 }}>{age}</div>
                    <div style={{ color: '#8a9199', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
