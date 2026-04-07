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
}

export function ExternalTaskDetailDrawer({ task, tasks, onClose, onNavigate }: Props) {
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
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="fixed right-0 top-0 z-50 flex h-screen w-[480px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasPrev && onNavigate(tasks[currentIndex - 1])}
              disabled={!hasPrev}
              aria-label="Previous task"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {currentIndex >= 0 && (
              <span className="text-xs text-zinc-600 tabular-nums">{currentIndex + 1} / {tasks.length}</span>
            )}
            <button
              onClick={() => hasNext && onNavigate(tasks[currentIndex + 1])}
              disabled={!hasNext}
              aria-label="Next task"
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
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
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority]}`} />
                {PRIORITY_LABELS[task.priority]}
              </span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${STATUS_STYLES[task.status]}`}>
              {STATUS_LABELS[task.status]}
            </span>
          </div>

          {/* Title */}
          <h2 id="drawer-title" className="text-base font-semibold text-zinc-100 leading-snug">{task.title}</h2>

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Description</p>
            {task.description ? (
              <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{task.description}</pre>
            ) : (
              <p className="text-sm text-zinc-600 italic">No description</p>
            )}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-500 mb-0.5">Project</p>
              <p className="text-zinc-300">{task.project || '—'}</p>
            </div>
            {task.dueDate && (
              <div>
                <p className="text-zinc-500 mb-0.5">Due</p>
                <p className="text-zinc-300">{task.dueDate}</p>
              </div>
            )}
            {task.createdAt && (
              <div>
                <p className="text-zinc-500 mb-0.5">Created</p>
                <p className="text-zinc-300">{relativeTime(task.createdAt)}</p>
              </div>
            )}
            {task.updatedAt && (
              <div>
                <p className="text-zinc-500 mb-0.5">Updated</p>
                <p className="text-zinc-300">{relativeTime(task.updatedAt)}</p>
              </div>
            )}
          </div>

          {/* Assignees */}
          {task.assignees.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Assignees</p>
              <div className="flex flex-wrap gap-1.5">
                {task.assignees.map(a => (
                  <span key={a} className="text-xs text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Labels */}
          {task.labels.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map(l => (
                  <span key={l} className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                    <Tag className="w-3 h-3" />{l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-zinc-800 p-4">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 bg-zinc-900 transition-colors inline-flex"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in {SOURCE_LABELS[task.source]}
          </a>
        </div>
      </div>
    </>
  )
}
