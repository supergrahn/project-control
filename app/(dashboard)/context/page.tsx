'use client'
import { useState } from 'react'
import { BookOpen, Plus, Trash2, X } from 'lucide-react'
import { useContextPacks, useCreateContextPack, useDeleteContextPack } from '@/hooks/useContextPacks'
import { useProjectStore } from '@/hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'

export default function ContextPage() {
  const { selectedProject } = useProjectStore()
  const { data: packs = [], isLoading } = useContextPacks(selectedProject?.id ?? null)
  const createPack = useCreateContextPack()
  const deletePack = useDeleteContextPack()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!selectedProject) return <p className="text-text-muted text-sm">Select a project to manage context packs.</p>
  if (isLoading) return <p className="text-text-muted text-sm">Loading...</p>

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) return
    await createPack.mutateAsync({ projectId: selectedProject.id, title, content, sourceUrl: sourceUrl || undefined })
    setTitle(''); setContent(''); setSourceUrl(''); setShowForm(false)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <BookOpen size={18} className="text-accent-blue" /> Context Packs
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Reference documentation injected into Claude sessions</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-blue/70 hover:bg-accent-blue text-white rounded">
          <Plus size={14} /> New Pack
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="rounded-lg border border-border-default bg-bg-primary p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">New Context Pack</h3>
            <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={14} /></button>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (e.g., 'Next.js 16 Migration Guide')" className="w-full bg-bg-base border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none mb-2" />
          <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Source URL (optional)" className="w-full bg-bg-base border border-border-default rounded px-3 py-2 text-sm text-text-secondary outline-none mb-2" />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Paste documentation, notes, or research content..." rows={8} className="w-full bg-bg-base border border-border-default rounded px-3 py-2 text-sm text-text-primary outline-none resize-none mb-3 font-mono" />
          <div className="flex justify-end">
            <button onClick={handleCreate} disabled={!title.trim() || !content.trim()} className="px-4 py-1.5 text-sm bg-accent-blue/70 hover:bg-accent-blue text-white rounded disabled:opacity-50">
              Save Pack
            </button>
          </div>
        </div>
      )}

      {/* Pack list */}
      {packs.length === 0 && !showForm && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <BookOpen size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No context packs yet</p>
          <p className="text-text-muted text-xs mt-1">Add documentation or research that Claude should reference during sessions.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {packs.map(pack => (
          <div key={pack.id} className="bg-bg-primary border border-border-default rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-bg-secondary transition-colors"
              onClick={() => setExpandedId(expandedId === pack.id ? null : pack.id)}>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{pack.title}</h3>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-text-muted">{pack.content.length} chars</span>
                  {pack.source_url && <span className="text-[10px] text-blue-400 truncate max-w-[200px]">{pack.source_url}</span>}
                  <span className="text-[10px] text-text-muted">{formatDistanceToNow(new Date(pack.updated_at), { addSuffix: true })}</span>
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); deletePack.mutate({ id: pack.id, projectId: selectedProject.id }) }}
                className="text-text-muted hover:text-accent-red transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
            {expandedId === pack.id && (
              <div className="px-4 py-3 border-t border-border-default bg-bg-base/50">
                <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">{pack.content}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
