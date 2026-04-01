'use client'
import type { Session } from '@/hooks/useSessions'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'
import { PHASE_INITIALS, PHASE_TO_STATUS } from '@/lib/sessionPhaseConfig'
import { PHASE_CONFIG } from '@/lib/taskPhaseConfig'

type Todo = { id: string; content: string; status: 'completed' | 'in_progress' | 'pending' }

function parseTodos(entries: FeedEntry[]): Todo[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const match = entries[i].text.match(/^TodoWrite\s+·\s+(\[.+\])/)
    if (match) {
      try { return JSON.parse(match[1]) } catch {}
    }
  }
  return []
}

// Parse a raw feed text line into a pill descriptor
type Pill = { type: 'Write' | 'Edit' | 'Bash' | 'Read' | 'Glob' | 'Grep'; detail: string }

function parsePill(text: string): Pill | null {
  const match = text.match(/^(Write|Edit|Bash|Read|Glob|Grep)\s+·\s+(.+)$/)
  if (!match) return null
  return { type: match[1] as Pill['type'], detail: match[2].trim() }
}

const PILL_COLORS: Record<string, string> = {
  Write: '#8f77c9', Edit: '#8f77c9',
  Bash: '#c97e2a',
  Read: '#5a6370', Glob: '#5a6370', Grep: '#5a6370',
}

type Props = {
  session: Session
  feedEntries: FeedEntry[]
  onStop: () => void
  onOpenTerminal: () => void
}

export function SessionAgentCard({ session, feedEntries, onStop, onOpenTerminal }: Props) {
  const isLive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()
  const taskStatus = PHASE_TO_STATUS[session.phase] ?? 'developing'
  const phaseStyle = PHASE_CONFIG[taskStatus] ?? PHASE_CONFIG['developing']

  const todos = parseTodos(feedEntries)
  const completedCount = todos.filter(t => t.status === 'completed').length

  const pills = feedEntries
    .slice(-5)
    .map(e => parsePill(e.text))
    .filter((p): p is Pill => p !== null)

  return (
    <div className="bg-bg-secondary border border-border-subtle rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-3 pb-2.5 border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7.5 h-7.5 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
            style={{
              background: phaseStyle.bgColor,
              color: phaseStyle.color,
              border: `1px solid ${phaseStyle.color}33`,
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-text-primary text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
              {session.label}
            </div>
            <div className="text-text-muted text-xs mt-0.5">{session.phase}</div>
          </div>
          <div className="flex items-center gap-1.25 flex-shrink-0">
            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-accent-green inline-block" />}
            <span className={`text-xs font-semibold ${isLive ? 'text-accent-green' : 'text-text-faint'}`}>
              {isLive ? 'Live' : 'Finished'}
            </span>
            {isLive && todos.length > 0 && (
              <span
                className="rounded-full text-xs font-semibold ml-1 px-1.5 py-0.25"
                style={{
                  color: phaseStyle.color,
                  background: phaseStyle.bgColor,
                  border: `1px solid ${phaseStyle.color}33`,
                }}
              >
                {completedCount} / {todos.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action feed */}
      <div className="p-2.5 min-h-15 border-b border-border-subtle font-mono">
        {pills.length === 0 ? (
          <div className="text-text-disabled text-xs">Waiting for tool calls…</div>
        ) : (
          pills.map((pill, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <span
                className="rounded text-xs font-bold flex-shrink-0 px-1.5 py-0.5"
                style={{
                  background: (PILL_COLORS[pill.type] ?? '#5a6370') + '22',
                  color: PILL_COLORS[pill.type] ?? '#5a6370',
                }}
              >
                {pill.type.toUpperCase()}
              </span>
              <span className="text-text-secondary text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                {pill.detail}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 p-2.5">
        <button
          onClick={onOpenTerminal}
          className="flex-1 bg-border-default border border-text-disabled text-text-secondary rounded-md px-0 py-1.5 text-xs cursor-pointer hover:border-border-hover"
        >
          Open Terminal
        </button>
        {isLive && (
          <button
            onClick={onStop}
            className="bg-transparent border border-accent-red text-accent-red rounded-md px-3 py-1.5 text-xs cursor-pointer hover:border-opacity-100"
            style={{ borderColor: '#c0404044' }}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
