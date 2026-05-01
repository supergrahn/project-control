'use client'

import { useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink, Tag } from 'lucide-react'
import type { ExternalTask } from '@/lib/types/externalTask'
import {
  SOURCE_STYLES, SOURCE_LABELS,
  STATUS_LABELS, STATUS_STYLES,
  PRIORITY_LABELS, PRIORITY_COLORS,
  relativeTime,
} from '@/lib/externalTasks/taskStyles'

interface Props {
  task: ExternalTask
  tasks: ExternalTask[]
  onClose: () => void
  onNavigate: (task: ExternalTask) => void
  /**
   * Optional: invoked after a successful POST to /api/tasks/:id/prepare.
   * Parents wire this to their SWR `mutate` (or equivalent) so the drawer
   * picks up the freshly written prep_status without waiting for the next
   * background revalidation.
   */
  onPrepStarted?: () => void
}

export function ExternalTaskDetailDrawer({ task, tasks, onClose, onNavigate, onPrepStarted }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeButtonRef.current?.focus() }, [])

  const currentIndex = tasks.findIndex(t => t.source === task.source && t.id === task.id)
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex !== -1 && currentIndex < tasks.length - 1

  // Close if task removed from list
  useEffect(() => {
    if (currentIndex === -1) onClose()
  }, [currentIndex, onClose])

  // Keyboard: Escape to close, arrows to navigate
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(tasks[currentIndex - 1])
      if (e.key === 'ArrowRight' && hasNext) onNavigate(tasks[currentIndex + 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNavigate, hasPrev, hasNext, currentIndex, tasks])

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-bg-overlay" onClick={onClose} />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed right-0 top-0 z-50 flex h-screen w-[480px] flex-col border-l border-border-default bg-bg-base shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-4 py-3 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasPrev && onNavigate(tasks[currentIndex - 1])}
              disabled={!hasPrev}
              aria-label="Previous task"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {currentIndex >= 0 && (
              <span className="text-xs text-text-muted tabular-nums">{currentIndex + 1} / {tasks.length}</span>
            )}
            <button
              onClick={() => hasNext && onNavigate(tasks[currentIndex + 1])}
              disabled={!hasNext}
              aria-label="Next task"
              className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SOURCE_STYLES[task.source]}`}>
              {SOURCE_LABELS[task.source]}
            </span>
            {task.priority && (
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
          </div>

          {/* Title */}
          <h2 id="drawer-title" className="text-base font-semibold text-text-primary leading-snug">{task.title}</h2>

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Description</p>
            {task.description ? (
              <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed">{task.description}</pre>
            ) : (
              <p className="text-sm text-text-muted italic">No description</p>
            )}
          </div>

          {/* Prep panel */}
          {(() => {
            const status = task.prep_status ?? null
            const onPrepare = async () => {
              await fetch(`/api/tasks/${encodeURIComponent(task.id)}/prepare`, { method: 'POST' })
              onPrepStarted?.()
            }

            if (status === null) {
              return (
                <div className="mt-4 p-3 rounded-[8px] bg-bg-secondary border border-border-default">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-primary text-sm font-semibold">🔮 Prep</span>
                    <span className="text-text-muted text-xs">Not yet prepped</span>
                  </div>
                  <button
                    type="button"
                    onClick={onPrepare}
                    className="text-sm bg-bg-tertiary hover:bg-bg-elevated text-text-primary border border-border-default rounded-[6px] px-3 py-1"
                  >
                    Prepare now
                  </button>
                </div>
              )
            }

            if (status === 'prepping') {
              return (
                <div className="mt-4 p-3 rounded-[8px] bg-bg-secondary border border-border-default">
                  <span className="text-text-primary text-sm font-semibold">🔮 Prep</span>
                  <div className="text-text-muted text-xs mt-2">Working — this usually takes 5-15 seconds.</div>
                </div>
              )
            }

            if (status === 'failed') {
              return (
                <div className="mt-4 p-3 rounded-[8px] bg-bg-secondary border border-border-default">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-primary text-sm font-semibold">🔮 Prep</span>
                    <span className="text-accent-red text-xs">Failed</span>
                  </div>
                  <button
                    type="button"
                    onClick={onPrepare}
                    className="text-sm bg-bg-tertiary hover:bg-bg-elevated text-text-primary border border-border-default rounded-[6px] px-3 py-1"
                  >
                    Retry
                  </button>
                </div>
              )
            }

            // status === 'ready'
            let notes: {
              summary: string; intent: string
              files: Array<{ path: string; why: string }>
              open_questions: string[]
              generated_at: string; model: string
            } | null = null
            try { if (task.prep_notes) notes = JSON.parse(task.prep_notes) } catch {}
            if (!notes) return null

            return (
              <div className="mt-4 p-3 rounded-[8px] bg-bg-secondary border border-border-default">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-text-primary text-sm font-semibold">🔮 Prep</span>
                  <span className="text-accent-green text-xs">Ready</span>
                </div>
                <p className="text-text-primary text-sm mb-2">{notes.summary}</p>
                {notes.intent && (
                  <p className="text-text-secondary text-xs mb-3"><strong>Intent:</strong> {notes.intent}</p>
                )}
                {notes.files.length > 0 && (
                  <div className="mb-3">
                    <div className="text-text-muted text-[11px] uppercase tracking-wide mb-1">Likely-relevant files</div>
                    <ul className="space-y-1">
                      {notes.files.map((f) => (
                        <li key={f.path} className="text-xs">
                          <code className="font-mono text-text-primary cursor-pointer" onClick={() => navigator.clipboard?.writeText(f.path)}>
                            {f.path}
                          </code>
                          {f.why && <span className="text-text-muted ml-2">— {f.why}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {notes.open_questions.length > 0 && (
                  <div className="mb-3">
                    <div className="text-text-muted text-[11px] uppercase tracking-wide mb-1">Open questions</div>
                    <ul className="list-disc list-inside text-xs text-text-primary space-y-0.5">
                      {notes.open_questions.map((q, i) => (<li key={i}>{q}</li>))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>Prepped {task.prepped_at ? relativeTime(task.prepped_at) : '—'} by {notes.model}</span>
                  <button
                    type="button"
                    onClick={onPrepare}
                    className="bg-transparent border border-border-default rounded px-2 py-0.5 text-text-secondary hover:text-text-primary"
                  >
                    Re-prep
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-text-secondary mb-0.5">Project</p>
              <p className="text-text-primary">{task.project || '—'}</p>
            </div>
            {task.dueDate && (
              <div>
                <p className="text-text-secondary mb-0.5">Due</p>
                <p className="text-text-primary">{task.dueDate}</p>
              </div>
            )}
            {task.createdAt && (
              <div>
                <p className="text-text-secondary mb-0.5">Created</p>
                <p className="text-text-primary">{relativeTime(task.createdAt)}</p>
              </div>
            )}
            {task.updatedAt && (
              <div>
                <p className="text-text-secondary mb-0.5">Updated</p>
                <p className="text-text-primary">{relativeTime(task.updatedAt)}</p>
              </div>
            )}
          </div>

          {/* Assignees */}
          {task.assignees.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Assignees</p>
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map(a => (
                  <span key={a} className="text-xs text-text-primary bg-bg-tertiary px-2 py-0.5 rounded-full">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Labels */}
          {task.labels.length > 0 && (
            <div>
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map(l => (
                  <span key={l} className="flex items-center gap-1 text-xs text-text-secondary bg-bg-tertiary px-2 py-0.5 rounded">
                    <Tag className="w-3 h-3" />{l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border-default p-4">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border-default hover:border-border-hover bg-bg-secondary transition-colors inline-flex"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in {SOURCE_LABELS[task.source]}
          </a>
        </div>
      </div>
    </>
  )
}
