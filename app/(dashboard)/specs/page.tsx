'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'

export default function SpecsPage() {
  const { selectedProject } = useProjectStore()
  const { data: files = [], isLoading, error } = useFiles(selectedProject?.id ?? null, 'specs')
  const createFile = useCreateFile()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view specs.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if (error) {
    return <p className="text-zinc-500 text-sm">Specs folder not configured. Go to Settings to set it up.</p>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">📋 Specs</h1>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Plus size={14} /> New Spec
        </button>
      </div>

      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="spec"
            onClick={() => setDrawerFile(f)}
            actions={[
              { label: '📋 Continue Spec', variant: 'primary', onClick: () => {} },
              { label: '🗺 Create Plan', onClick: () => {} },
            ]}
          />
        ))}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showNewDialog && (
        <NewFileDialog
          label="Spec"
          onCancel={() => setShowNewDialog(false)}
          onConfirm={async (name) => {
            setShowNewDialog(false)
            await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'specs', name })
          }}
        />
      )}
    </>
  )
}
