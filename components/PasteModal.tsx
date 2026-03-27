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
      <div className="fixed inset-0 z-50 bg-black/60" onClick={onClose} />
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 z-50 w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <ClipboardPaste size={14} className="text-violet-400" />
            <span className="text-sm font-semibold text-zinc-100">Quick Paste</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
        </div>
        <div className="px-4 py-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (auto-generated if empty)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none mb-2" />
          <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
            placeholder="Paste content here — from NotebookLM, docs, anywhere..."
            rows={6} className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none resize-none mb-2 font-mono" />
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (comma-separated, optional)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-400 outline-none mb-3" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-zinc-600">{selectedProject ? `Saving to ${selectedProject.name}` : 'No project selected (global)'}</span>
            <button onClick={handleSave} disabled={!content.trim() || saving}
              className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-50">
              Save to Bookmarks
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
