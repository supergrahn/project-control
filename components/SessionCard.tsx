'use client'
import type { OrchestratorDecision, SessionProposedAction } from '@/lib/orchestrator-types'

interface ProgressStep { label: string; status: 'done' | 'active' | 'pending' }

type SessionData = {
  id: string
  label: string
  phase: string
  source_file: string | null
  status: string
  created_at: string
  progress_steps?: string | null
}

function stepIcon(s: ProgressStep['status']) { return s === 'done' ? '✓' : s === 'active' ? '→' : '○' }
function stepColour(s: ProgressStep['status']) {
  return s === 'done' ? 'text-green-400' : s === 'active' ? 'text-blue-400' : 'text-zinc-600'
}

const phaseColour: Record<string, string> = {
  brainstorm: 'bg-blue-500/20 text-blue-300',
  spec: 'bg-violet-500/20 text-violet-300',
  plan: 'bg-violet-500/20 text-violet-300',
  develop: 'bg-green-500/20 text-green-300',
  review: 'bg-amber-500/20 text-amber-300',
}

function elapsed(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h`
}

type Props = {
  session: SessionData
  latestDecision?: OrchestratorDecision | null
  proposedActions?: SessionProposedAction[]
  isGated?: boolean
  onAction?: (actionId: string) => void
}

export function SessionCard({ session, latestDecision, proposedActions = [], isGated = false, onAction }: Props) {
  let steps: ProgressStep[] = []
  if (session.progress_steps) {
    try { steps = JSON.parse(session.progress_steps) as ProgressStep[] } catch {}
  }
  const doneCount = steps.filter(s => s.status === 'done').length
  const progress = steps.length > 0 ? (doneCount / steps.length) * 100 : 0
  const featureName = session.source_file?.split('/').pop()?.replace('.md', '') ?? session.label

  return (
    <div className={`bg-zinc-900 border rounded-lg p-2.5 w-[190px] flex flex-col self-stretch ${
      isGated ? 'border-amber-500/40' : 'border-zinc-800'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <span className="font-semibold text-[11px] text-zinc-300 truncate">{featureName}</span>
        {isGated ? (
          <span className="bg-amber-500/20 text-amber-400 rounded px-1 text-[9px] shrink-0">⏸ gate</span>
        ) : session.status === 'ended' ? (
          <span className="bg-green-500/20 text-green-400 rounded px-1 text-[9px] shrink-0">✓ done</span>
        ) : (
          <span className="bg-violet-500/20 text-violet-300 rounded px-1 text-[9px] shrink-0">● live</span>
        )}
      </div>

      {/* Phase badge */}
      <div className="mt-1.5">
        <span className={`rounded px-1.5 py-0.5 text-[9px] ${phaseColour[session.phase] ?? 'bg-zinc-800 text-zinc-400'}`}>
          {session.phase} · {elapsed(session.created_at)}
        </span>
      </div>

      {/* Progress checklist */}
      {steps.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5">
          {steps.map((step, i) => (
            <div key={i} className={`flex items-center gap-1 text-[9px] ${stepColour(step.status)}`}>
              <span>{stepIcon(step.status)}</span>
              <span className="truncate">{step.label}</span>
            </div>
          ))}
          <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[9px] text-zinc-600">{doneCount}/{steps.length} done</div>
        </div>
      )}

      {/* Orchestrator note */}
      {latestDecision && (
        <div className="mt-2 px-1.5 py-1 bg-zinc-950 border-l-2 border-amber-800 rounded-r text-[9px] text-zinc-400 leading-snug">
          🤖 {latestDecision.summary}
        </div>
      )}

      {/* Proposed actions */}
      {proposedActions.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {proposedActions.slice(0, 3).map(action => (
            <button
              key={action.id}
              onClick={() => onAction?.(action.id)}
              className={`flex-1 min-w-0 text-[9px] rounded px-1 py-0.5 cursor-pointer ${
                action.action_type === 'skip' || action.action_type === 'archive'
                  ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
