'use client'
import { useState, useRef, useEffect } from 'react'
import { X, ClipboardPaste } from 'lucide-react'
import { useProjectStore } from '@/hooks/useProjects'
import { useCreateBookmark } from '@/hooks/useBookmarks'

type Props = { isOpen: boolean; onClose: () => void }

export function PasteModal({ isOpen, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { selectedProject } = useProjectStore()
  const create = useCreateBookmark()

  useEffect(() => {
    if (!isOpen) return
    setTitle(''); setContent(''); setTags('')
    // Try to read clipboard
    navigator.clipboard.readText().then(text => {
      if (text) setContent(text)
    }).catch(() => {})
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [isOpen])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      await create.mutateAsync({
        projectId: selectedProject?.id,
        title: title || `Paste ${new Date().toISOString().slice(0, 16)}`,
        content,
        tags: tags || undefined,
      })
      onClose()
    } catch {}
    setSaving(false)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-bg-overlay" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-bg-primary border border-border-strong rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <ClipboardPaste size={14} className="text-accent-blue" />
            <span className="text-sm font-semibold text-text-primary">Quick Paste</span>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
        </div>
        <div className="px-4 py-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (auto-generated if empty)"
            className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none mb-2" />
          <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Paste content here — from NotebookLM, docs, anywhere..."
            rows={6} className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none resize-none mb-2 font-mono" />
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (comma-separated, optional)"
            className="w-full bg-bg-secondary border border-border-default rounded px-3 py-2 text-sm text-text-secondary outline-none mb-3" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-text-faint">{selectedProject ? `Saving to ${selectedProject.name}` : 'No project selected (global)'}</span>
            <button onClick={handleSave} disabled={!content.trim() || saving}
              className="px-4 py-1.5 text-sm bg-accent-blue hover:bg-accent-blue text-white rounded disabled:opacity-50">
              Save to Bookmarks
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
