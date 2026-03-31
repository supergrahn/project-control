'use client'
import type { Session } from '@/hooks/useSessions'
import type { FeedEntry } from '@/hooks/useOrchestratorFeed'
import { PHASE_INITIALS, PHASE_TO_STATUS } from '@/lib/sessionPhaseConfig'
import { PHASE_CONFIG } from '@/lib/taskPhaseConfig'

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

  const pills = feedEntries
    .slice(-5)
    .map(e => parsePill(e.text))
    .filter((p): p is Pill => p !== null)

  const card: React.CSSProperties = {
    background: '#141618', border: '1px solid #1e2124', borderRadius: 8,
    overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
  }

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #1e2124' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
            background: phaseStyle.bgColor, border: `1px solid ${phaseStyle.color}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: phaseStyle.color, fontSize: 10, fontWeight: 700,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#e2e6ea', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.label}
            </div>
            <div style={{ color: '#5a6370', fontSize: 10, marginTop: 2 }}>{session.phase}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3a8c5c', display: 'inline-block' }} />}
            <span style={{ color: isLive ? '#3a8c5c' : '#454c54', fontSize: 11, fontWeight: 600 }}>
              {isLive ? 'Live' : 'Finished'}
            </span>
          </div>
        </div>
      </div>

      {/* Action feed */}
      <div style={{ padding: '10px 14px', minHeight: 60, borderBottom: '1px solid #1e2124', fontFamily: 'monospace' }}>
        {pills.length === 0 ? (
          <div style={{ color: '#2e3338', fontSize: 11 }}>Waiting for tool calls…</div>
        ) : (
          pills.map((pill, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                background: (PILL_COLORS[pill.type] ?? '#5a6370') + '22',
                color: PILL_COLORS[pill.type] ?? '#5a6370',
                borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700,
                flexShrink: 0,
              }}>
                {pill.type.toUpperCase()}
              </span>
              <span style={{ color: '#8a9199', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pill.detail}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px' }}>
        <button onClick={onOpenTerminal} style={{
          flex: 1, background: '#1c1f22', border: '1px solid #2e3338', color: '#8a9199',
          borderRadius: 6, padding: '6px 0', fontSize: 12, cursor: 'pointer',
        }}>
          Open Terminal
        </button>
        {isLive && (
          <button onClick={onStop} style={{
            background: 'none', border: '1px solid #c0404044', color: '#c04040',
            borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
          }}>
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
