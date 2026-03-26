// components/MemoryDrawer.tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Save, Trash2 } from 'lucide-react'
import { useUpdateMemory, useDeleteMemory, type MemoryFile } from '@/hooks/useMemory'

const TYPE_COLORS: Record<string, string> = {
  project: 'bg-violet-500/20 text-violet-300',
  feedback: 'bg-amber-500/20 text-amber-300',
  user: 'bg-sky-500/20 text-sky-300',
  reference: 'bg-zinc-500/20 text-zinc-400',
}

type Props = {
  file: MemoryFile | null
  projectId: string
  onClose: () => void
}

export function MemoryDrawer({ file, projectId, onClose }: Props) {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updateMemory = useUpdateMemory()
  const deleteMemory = useDeleteMemory()

  useEffect(() => {
    if (file) {
      setContent(file.content)
      setSavedContent(file.content)
      setSaveState('idle')
      setConfirmDelete(false)
    }
  }, [file])

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  if (!file) return null

  const isDirty = content !== savedContent

  const handleClose = () => {
    if (isDirty && !confirm('You have unsaved changes. Discard them?')) return
    onClose()
  }

  const handleSave = async () => {
    setSaveState('saving')
    try {
      await updateMemory.mutateAsync({ projectId, filename: file.filename, content })
      setSavedContent(content)
      setSaveState('saved')
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('idle')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    try {
      await deleteMemory.mutateAsync({ projectId, filename: file.filename })
      onClose()
    } catch {
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={handleClose} />
      <aside className="fixed right-0 top-0 h-full w-[640px] z-50 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 shrink-0">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[file.type] ?? TYPE_COLORS.reference}`}>
            {file.type}
          </span>
          <span className="text-zinc-100 font-semibold text-sm truncate flex-1">{file.name || file.filename}</span>
          {isDirty && <span className="text-[10px] text-amber-400">unsaved</span>}
          <button type="button" onClick={handleClose} className="text-zinc-500 hover:text-zinc-100 transition-colors p-1 rounded hover:bg-zinc-800 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* Description */}
        {file.description && (
          <p className="px-5 py-2 text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-950/50">{file.description}</p>
        )}

        {/* Editor */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="flex-1 resize-none bg-transparent text-sm font-mono text-zinc-200 px-5 py-4 outline-none leading-relaxed"
          spellCheck={false}
        />

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 shrink-0 bg-zinc-950/50">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                <Trash2 size={12} /> Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">Delete this memory?</span>
                <button type="button" onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 font-medium">Yes, delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveState === 'saving'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-colors ${
              saveState === 'saved'
                ? 'bg-green-500/20 text-green-300'
                : isDirty
                  ? 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-zinc-800 text-zinc-600 cursor-default'
            }`}
          >
            <Save size={12} />
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      </aside>
    </>
  )
}
