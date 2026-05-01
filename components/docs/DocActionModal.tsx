'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export type DocActionPhase = 'brainstorm' | 'spec' | 'plan' | 'develop'

type Props = {
  open: boolean
  projectId: string
  phase: DocActionPhase
  sourceFile: string
  sourceName: string
  onClose: () => void
  onStarted: () => void
}

const PHASE_TITLES: Record<DocActionPhase, string> = {
  brainstorm: 'Brainstorm',
  spec: 'Make spec',
  plan: 'Make plan',
  develop: 'Develop',
}

function defaultPrompt(phase: DocActionPhase, sourceFile: string): string {
  switch (phase) {
    case 'brainstorm':
      return `Brainstorm this idea further. The source material is attached as ${sourceFile}.`
    case 'spec':
      return `Write a spec based on this. The source material is attached as ${sourceFile}.`
    case 'plan':
      return `Write an implementation plan from this spec. The source material is attached as ${sourceFile}.`
    case 'develop':
      return `Implement this plan. The source material is attached as ${sourceFile}.`
  }
}

export function DocActionModal({ open, projectId, phase, sourceFile, sourceName, onClose, onStarted }: Props) {
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setPrompt(defaultPrompt(phase, sourceFile))
    setError(null)
    setSubmitting(false)
  }, [open, phase, sourceFile])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  async function handleStart() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          phase,
          sourceFile,
          userContext: prompt,
          permissionMode: 'default',
        }),
      })
      if (!res.ok) {
        let message = `Failed to start session (${res.status})`
        try {
          const data = await res.json()
          if (data && typeof data.error === 'string') message = data.error
        } catch {
          // ignore JSON parse failure, use default message
        }
        setError(message)
        setSubmitting(false)
        return
      }
      onStarted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session')
      setSubmitting(false)
    }
  }

  const title = `${PHASE_TITLES[phase]} from "${sourceName}"`

  return (
    <div
      className="fixed inset-0 bg-bg-overlay flex items-center justify-center z-50"
      onMouseDown={onClose}
    >
      <div
        className="w-[560px] max-w-[92vw] bg-bg-primary border border-border-default rounded-[8px] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-border-default flex items-center justify-between">
          <div className="text-text-primary text-[14px] font-semibold truncate">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary bg-transparent border-none p-1 cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          <div className="text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1.5">Source</div>
          <div className="bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-2 text-text-primary text-[12px] font-mono truncate mb-4">
            {sourceFile}
          </div>

          <div className="text-text-muted text-[10px] uppercase tracking-[0.04em] mb-1.5">Prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            autoFocus
            aria-label="Prompt"
            className="w-full bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-2 text-text-primary text-[13px] resize-y"
          />

          {error && (
            <div role="alert" className="mt-3 text-accent-red text-[12px]">{error}</div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border-default flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-bg-secondary text-text-muted border border-border-default rounded-[6px] px-3.5 py-1.5 text-[12px] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={submitting}
            className="bg-[#0d1a2d] text-accent-blue border border-accent-blue/30 rounded-[6px] px-3.5 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Starting...' : 'Start session'}
          </button>
        </div>
      </div>
    </div>
  )
}
