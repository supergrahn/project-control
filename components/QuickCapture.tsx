'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Lightbulb } from 'lucide-react'
import { useProjectStore } from '@/hooks/useProjects'
import { useCreateFile } from '@/hooks/useFiles'

type Props = { isOpen: boolean; onClose: () => void }

export function QuickCapture({ isOpen, onClose }: Props) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { selectedProject } = useProjectStore()
  const createFile = useCreateFile()

  useEffect(() => {
    if (isOpen) { inputRef.current?.focus(); setText('') }
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!text.trim() || !selectedProject) return
    setSaving(true)
    try {
      await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'ideas', name: text.trim() })
      onClose()
    } catch {}
    setSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md">
      <div className="bg-bg-primary border border-border-strong rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
        <Lightbulb size={16} className="text-accent-orange shrink-0" />
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedProject ? `Quick idea for ${selectedProject.name}...` : 'Select a project first...'}
          disabled={!selectedProject || saving}
          className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder-text-faint"
        />
        <button onClick={handleSave} disabled={!text.trim() || !selectedProject || saving}
          className="text-xs px-3 py-1 bg-accent-orange hover:bg-accent-orange text-white rounded disabled:opacity-50">
          Save
        </button>
        <button onClick={onClose} className="text-text-muted hover:text-text-secondary"><X size={14} /></button>
      </div>
      {!selectedProject && <p className="text-center text-[10px] text-text-faint mt-1">Open a project tab first to capture ideas</p>}
    </div>
  )
}
