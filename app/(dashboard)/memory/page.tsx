// app/(dashboard)/memory/page.tsx
'use client'
import { useState } from 'react'
import { Brain } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MemoryDrawer } from '@/components/MemoryDrawer'
import { useMemory, type MemoryFile } from '@/hooks/useMemory'
import { useProjectStore } from '@/hooks/useProjects'
import { formatDistanceToNow } from 'date-fns'

const TYPE_COLORS: Record<string, string> = {
  project: 'bg-violet-500/20 text-violet-300',
  feedback: 'bg-amber-500/20 text-amber-300',
  user: 'bg-sky-500/20 text-sky-300',
  reference: 'bg-zinc-500/20 text-zinc-400',
}

const TYPE_LABELS: Record<string, string> = {
  project: 'project',
  feedback: 'feedback',
  user: 'user',
  reference: 'reference',
}

export default function MemoryPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, isError } = useMemory(selectedProject?.id ?? null)
  const [activeFile, setActiveFile] = useState<MemoryFile | null>(null)

  if (!selectedProject) {
    return <p className="text-text-muted text-sm">Select a project to view its memory.</p>
  }

  if (isLoading) return <p className="text-text-muted text-sm">Loading…</p>
  if (isError) return <p className="text-text-muted text-sm">Failed to load memory files.</p>

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Brain size={18} className="text-accent-blue" /> Memory
          </h1>
          <p className="text-xs text-text-muted mt-0.5">What Claude remembers about this project across sessions</p>
        </div>
      </div>

      {(data === null || data?.length === 0) && (
        <div className="rounded-lg border border-border-default bg-bg-primary/50 px-6 py-10 text-center">
          <Brain size={28} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-secondary text-sm font-medium">No memories yet</p>
          <p className="text-text-muted text-xs mt-1">Claude will create memory files automatically as you run sessions.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <CardGrid>
          {data.map(f => (
            <div
              key={f.path}
              className="bg-bg-primary border border-border-default rounded-lg overflow-hidden hover:border-border-strong transition-colors flex flex-col cursor-pointer"
              onClick={() => setActiveFile(f)}
            >
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-text-primary line-clamp-2">{f.name}</h3>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full ${TYPE_COLORS[f.type] ?? TYPE_COLORS.reference}`}>
                    {TYPE_LABELS[f.type]}
                  </span>
                </div>
                {f.description && (
                  <p className="text-xs text-text-muted line-clamp-2 mb-3">{f.description}</p>
                )}
                <p className="text-[10px] text-text-muted">{formatDistanceToNow(new Date(f.modifiedAt), { addSuffix: true })}</p>
              </div>
              <div className="border-t border-border-default bg-bg-base px-3 py-2">
                <span className="text-[10px] text-text-muted font-mono">{f.filename}</span>
              </div>
            </div>
          ))}
        </CardGrid>
      )}

      {selectedProject && (
        <MemoryDrawer
          file={activeFile}
          projectId={selectedProject.id}
          onClose={() => setActiveFile(null)}
        />
      )}
    </>
  )
}
