'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, ChevronLeft, ChevronRight, ExternalLink, Square } from 'lucide-react'
import type { Session } from '@/hooks/useSessions'
import { useKillSession } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { useTasks } from '@/hooks/useTasks'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { useSessionTerminal } from '@/hooks/useSessionTerminal'
import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'
import { PHASE_INITIALS } from '@/lib/sessionPhaseConfig'
import { getSessionOriginator } from '@/lib/sessions/originator'

type Props = {
  session: Session
  sessions: Session[]
  onClose: () => void
  onNavigate: (s: Session) => void
}

export function SessionDetailDrawer({ session, sessions, onClose, onNavigate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const { data: projects = [] } = useProjects()
  const project = projects.find(p => p.id === session.project_id)
  const projectName = project?.name ?? session.project_id
  const projectPath = project?.path
  const { tasks: allTasks = [] } = useTasks(session.project_id)
  const originator = getSessionOriginator(session, { tasks: allTasks, projectPath })
  const killSession = useKillSession()
  const { openWindow } = useSessionWindows()
  const isActive = !session.ended_at
  const initials = PHASE_INITIALS[session.phase] ?? session.phase.slice(0, 2).toUpperCase()

  const { termStatus, sessionState, sessionReason, sessionMessage, sessionProvider, retryAfter } =
    useSessionTerminal({ sessionId: session.id, containerRef, enabled: true })

  const idx = sessions.findIndex(s => s.id === session.id)
  const hasPrev = idx > 0
  const hasNext = idx !== -1 && idx < sessions.length - 1

  useEffect(() => { closeBtnRef.current?.focus() }, [])

  // Auto-close if session leaves the list
  useEffect(() => {
    if (idx === -1) onClose()
  }, [idx, onClose])

  // Stable keyboard listener: read fresh state from refs so we don't add/remove
  // the global keydown handler on every parent render.
  const stateRef = useRef({ onClose, onNavigate, hasPrev, hasNext, idx, sessions })
  stateRef.current = { onClose, onNavigate, hasPrev, hasNext, idx, sessions }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = stateRef.current
      if (e.key === 'Escape') { s.onClose(); return }
      if (e.key === 'ArrowLeft' && s.hasPrev) s.onNavigate(s.sessions[s.idx - 1])
      if (e.key === 'ArrowRight' && s.hasNext) s.onNavigate(s.sessions[s.idx + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-overlay" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 z-50 flex h-screen w-[600px] flex-col border-l border-border-default bg-bg-base shadow-2xl"
      >
        {/* Row 1: prev/next + count + close */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-2 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasPrev && onNavigate(sessions[idx - 1])}
              disabled={!hasPrev}
              aria-label="Previous session"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {idx >= 0 && (
              <span className="text-xs text-text-muted tabular-nums">{idx + 1} / {sessions.length}</span>
            )}
            <button
              onClick={() => hasNext && onNavigate(sessions[idx + 1])}
              disabled={!hasNext}
              aria-label="Next session"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: project + label + badges */}
        <div className="px-4 py-3 border-b border-border-default shrink-0">
          <div className="text-[10px] text-text-faint uppercase tracking-wide">{projectName}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-bg-tertiary text-text-secondary">
              {initials}
            </span>
            <span className="text-text-primary text-sm font-semibold flex-1 truncate">{session.label}</span>
            <span className={`text-xs font-semibold ${isActive ? 'text-accent-green' : 'text-text-faint'}`}>
              {isActive ? '● Live' : 'Finished'}
            </span>
          </div>
          <div className="text-text-muted text-[11px] mt-1">{session.phase}</div>
        </div>

        {/* Originator: "From X" line */}
        <div className="px-4 py-1 text-[11px] text-text-muted border-b border-border-default shrink-0">
          {originator.kind === 'task' && (
            <>
              From <Link href={originator.task.href} className="text-accent-blue hover:underline">{originator.task.label}</Link>
              {originator.doc && (
                <> via <Link href={originator.doc.href} className="text-accent-blue hover:underline">{originator.doc.label}</Link></>
              )}
              {' '}<ExternalLink className="inline w-3 h-3" />
            </>
          )}
          {originator.kind === 'doc' && (
            <>From <Link href={originator.doc.href} className="text-accent-blue hover:underline">{originator.doc.label}</Link> <ExternalLink className="inline w-3 h-3" /></>
          )}
          {originator.kind === 'agent' && (
            <>From <Link href={originator.agent.href} className="text-accent-blue hover:underline">{originator.agent.label}</Link> <ExternalLink className="inline w-3 h-3" /></>
          )}
          {originator.kind === 'standalone' && (
            <span className="text-text-faint">From standalone</span>
          )}
        </div>

        {/* Row 3: actions */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-default shrink-0">
          <button
            onClick={() => { openWindow(session); onClose() }}
            className="flex items-center gap-1 bg-bg-secondary border border-border-default text-text-secondary rounded px-2.5 py-1 text-xs hover:text-text-primary"
          >
            <ExternalLink className="w-3 h-3" /> Pop out
          </button>
          {isActive && (
            <button
              onClick={() => { killSession.mutate(session.id); onClose() }}
              className="flex items-center gap-1 bg-transparent border border-accent-red text-accent-red rounded px-2.5 py-1 text-xs hover:opacity-80"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
        </div>

        {/* Status banner */}
        <SessionStatusBanner
          state={sessionState}
          reason={sessionReason}
          message={sessionMessage}
          provider={sessionProvider}
          retryAfter={retryAfter}
        />

        {/* Next-actions block (extracted by local LLM after the session ends) */}
        <NextActionsSection session={session} />

        {/* Terminal */}
        <div className="relative flex-1 min-h-0 bg-bg-base">
          <div ref={containerRef} className="absolute inset-0 p-2" />
          {termStatus === 'connecting' && (
            <div className="absolute top-2 right-2 text-[10px] text-text-faint">connecting…</div>
          )}
        </div>
      </div>
    </>
  )
}

type NextActionsPayload = {
  next_actions?: string[]
  open_questions?: string[]
  files_touched?: Array<{ path: string; change: string }>
  extracted_at?: string
  model?: string
}

function NextActionsSection({ session }: { session: Session }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nextActions = session.next_actions ?? null
  if (!nextActions) return null
  let parsed: NextActionsPayload | null = null
  try {
    parsed = JSON.parse(nextActions) as NextActionsPayload
  } catch {
    return null
  }
  if (!parsed) return null

  const hasNext = (parsed.next_actions?.length ?? 0) > 0
  const hasQuestions = (parsed.open_questions?.length ?? 0) > 0
  const hasFiles = (parsed.files_touched?.length ?? 0) > 0
  if (!hasNext && !hasQuestions && !hasFiles) return null

  const hasOriginator = !!(session.task_id || session.source_file)
  const canContinue = hasNext && hasOriginator

  async function handleContinue() {
    setPending(true)
    setError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}/continue`, { method: 'POST' })
      const data = (await res.json()) as { sessionId?: string; error?: string }
      if (!res.ok || !data.sessionId) {
        setError(data.error ?? 'failed to continue')
        return
      }
      router.push(`/sessions?selected=${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="border-b border-border-default px-4 py-3 shrink-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary mb-2">
        Next
        {parsed.model && (
          <span className="text-text-faint normal-case font-normal"> · extracted by {parsed.model}</span>
        )}
      </div>
      {hasNext && (
        <ul className="text-xs text-text-primary mb-3 space-y-1">
          {parsed.next_actions!.map((a, i) => (
            <li key={i}>• {a}</li>
          ))}
        </ul>
      )}
      {hasQuestions && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
            Open questions
          </div>
          <ul className="text-xs text-text-primary mb-3 space-y-1">
            {parsed.open_questions!.map((q, i) => (
              <li key={i}>• {q}</li>
            ))}
          </ul>
        </>
      )}
      {hasFiles && (
        <>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary mb-1.5">
            Files touched
          </div>
          <ul className="text-xs font-mono text-text-primary space-y-0.5">
            {parsed.files_touched!.map((f, i) => (
              <li key={i}>
                <span className="text-accent-blue">{f.path}</span>{' '}
                <span className="text-text-muted">— {f.change}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {canContinue && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleContinue}
            disabled={pending}
            aria-label="Continue this session"
            className="inline-flex items-center gap-1.5 bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-3.5 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Spawning…' : 'Continue →'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-accent-red text-[12px]">{error}</p>}
    </div>
  )
}
