'use client'
import { useState } from 'react'
import { Bookmark, Plus, Trash2, X } from 'lucide-react'
import { useBookmarks, useCreateBookmark, useDeleteBookmark } from '@/hooks/useBookmarks'
import { useProjectStore } from '@/hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'

export default function BookmarksPage() {
  const { selectedProject } = useProjectStore()
  const { data: bookmarks = [], isLoading } = useBookmarks(selectedProject?.id)
  const create = useCreateBookmark()
  const remove = useDeleteBookmark()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [tags, setTags] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return
    await create.mutateAsync({ projectId: selectedProject?.id, title, content, sourceUrl: sourceUrl || undefined, tags: tags || undefined })
    setTitle(''); setContent(''); setSourceUrl(''); setTags(''); setShowForm(false)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            <Bookmark size={18} className="text-violet-400" /> Research Bookmarks
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">Save research, docs, and notes from any source</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded">
          <Plus size={14} /> Add Bookmark
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-200">New Bookmark</h3>
            <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-zinc-300"><X size={14} /></button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none mb-2" />
          <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-400 outline-none mb-2" />
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="Tags (comma-separated, optional)" className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-400 outline-none mb-2" />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content — paste from NotebookLM, articles, docs..." rows={6} className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 outline-none resize-none mb-3 font-mono" />
          <div className="flex justify-end">
            <button onClick={handleCreate} disabled={!title.trim() || !content.trim()} className="px-4 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded disabled:opacity-50">Save</button>
          </div>
        </div>
      )}

      {bookmarks.length === 0 && !showForm && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
          <Bookmark size={28} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-400 text-sm font-medium">No bookmarks yet</p>
          <p className="text-zinc-600 text-xs mt-1">Save research from NotebookLM, docs, or any source.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {bookmarks.map(b => (
          <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/50" onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}>
              <div>
                <h3 className="text-sm font-semibold text-zinc-200">{b.title}</h3>
                <div className="flex items-center gap-3 mt-0.5">
                  {b.tags && b.tags.split(',').map(t => <span key={t} className="text-[10px] text-violet-400">#{t.trim()}</span>)}
                  {b.source_url && <span className="text-[10px] text-blue-400 truncate max-w-[200px]">{b.source_url}</span>}
                  <span className="text-[10px] text-zinc-600">{formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</span>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); remove.mutate(b.id) }} className="text-zinc-600 hover:text-red-400 p-1"><Trash2 size={14} /></button>
            </div>
            {expandedId === b.id && (
              <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/50">
                <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{b.content}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
