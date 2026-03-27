'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { getSystemPrompt, type Phase } from '@/lib/prompts'

type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

type Props = {
  phase: Phase
  sourceFile: string
  onLaunch: (userContext: string, permissionMode: PermissionMode, correctionNote?: string) => void
  onCancel: () => void
}

const ACTION_LABELS: Record<Phase, string> = {
  ideate: '💡 Ideate',
  brainstorm: '💬 Brainstorm',
  spec: '📋 Create Spec',
  plan: '🗺 Create Plan',
  develop: '🚀 Start Developing',
  review: '🔍 Review',
  audit: '🔎 Audit Plan',
}

export function PromptModal({ phase, sourceFile, onLaunch, onCancel }: Props) {
  const [userContext, setUserContext] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const systemPrompt = getSystemPrompt(phase, sourceFile)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md shadow-2xl">
        <h2 className="text-sm font-semibold text-zinc-100 mb-1">{ACTION_LABELS[phase]}</h2>
        <p className="text-xs text-zinc-500 mb-4 truncate">{sourceFile.split('/').pop()}</p>

        <button
          onClick={() => setShowSystemPrompt((s) => !s)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 mb-2"
        >
          {showSystemPrompt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Show system prompt
        </button>
        {showSystemPrompt && (
          <div className="bg-zinc-950 rounded p-3 text-xs text-zinc-500 mb-3 max-h-32 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
            {systemPrompt}
          </div>
        )}

        <label className="block text-xs text-zinc-400 mb-1.5">
          Add your context <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          value={userContext}
          onChange={(e) => setUserContext(e.target.value)}
          placeholder="Any specific focus, constraints, or instructions..."
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500 resize-none mb-4"
        />

        {phase === 'develop' && (
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1.5">
              Correction notes <span className="text-zinc-600">(optional — anything the plan got wrong?)</span>
            </label>
            <textarea
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="Flag issues from the plan or previous phase..."
              rows={2}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none focus:border-amber-500 resize-none"
            />
          </div>
        )}

        {phase === 'develop' && (
          <div className="mb-4">
            <label className="block text-xs text-zinc-400 mb-1.5">Permission level</label>
            <select
              value={permissionMode}
              onChange={(e) => setPermissionMode(e.target.value as PermissionMode)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 outline-none"
            >
              <option value="default">Ask for each tool (default)</option>
              <option value="acceptEdits">Auto-accept file edits</option>
              <option value="bypassPermissions">Bypass all prompts ⚠️</option>
            </select>
            {permissionMode === 'bypassPermissions' && (
              <p className="flex items-center gap-1 text-xs text-amber-400 mt-1.5">
                <AlertTriangle size={12} /> All tool permissions will be bypassed automatically.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">Cancel</button>
          <button
            onClick={() => onLaunch(userContext, permissionMode, correctionNote || undefined)}
            className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
          >
            Launch Session →
          </button>
        </div>
      </div>
    </div>
  )
}
