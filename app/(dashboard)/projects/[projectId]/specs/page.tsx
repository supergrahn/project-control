'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, usePromoteFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession } from '@/hooks/useSessions'
import { useSessionWindows } from '@/hooks/useSessionWindows'

const DIR = 'specs'

export default function SpecsPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, DIR)
  const files = data ?? []
  const createFile = useCreateFile()
  const promoteFile = usePromoteFile()
  const launchSession = useLaunchSession()
  const { openWindow, bringToFront } = useSessionWindows()
  const qc = useQueryClient()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view specs.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if (data === null || error) return <SetupPrompt dir={DIR} />

  async function startSession(file: MarkdownFile, phase: string) {
    if (!selectedProject) return
    try {
      const result = await launchSession.mutateAsync({
        projectId: selectedProject.id,
        phase,
        sourceFile: file.path,
        userContext: '',
        permissionMode: 'default',
      })
      if (result.sessionId) {
        openWindow({
          id: result.sessionId,
          project_id: selectedProject.id,
          label: `${file.title} · ${phase}`,
          phase,
          source_file: file.path,
          status: 'active',
          created_at: new Date().toISOString(),
          ended_at: null,
        })
        qc.invalidateQueries({ queryKey: ['files', selectedProject.id, DIR] })
      }
    } catch {}
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

      {files.length === 0 && (
        <p className="text-zinc-600 text-sm">No specs yet. Create one or generate from an idea.</p>
      )}
      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="spec"
            onClick={() => setDrawerFile(f)}
            phaseSessionState={f.sessions.spec}
            onLiveBadgeClick={() => { if (f.sessions.spec.sessionId) bringToFront(f.sessions.spec.sessionId) }}
            onViewLog={() => { if (f.sessions.spec.logId) setDrawerFile({ ...f, path: f.sessions.spec.logId, title: `${f.title} — spec log`, content: '' }) }}
            onResume={() => startSession(f, 'spec')}
            actions={[
              { label: '📐 Spec', variant: 'primary', onClick: () => startSession(f, 'spec') },
              { label: '🗺 → Plans', onClick: () => promoteFile.mutate({ projectId: selectedProject.id, sourceFile: f.path, targetDir: 'plans' }) },
              { label: '🗺 Create Plan', onClick: () => startSession(f, 'plan') },
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
            try {
              await createFile.mutateAsync({ projectId: selectedProject.id, dir: DIR, name })
              setShowNewDialog(false)
            } catch {
              // mutation failed — leave dialog open, user can retry
            }
          }}
        />
      )}
    </>
  )
}
