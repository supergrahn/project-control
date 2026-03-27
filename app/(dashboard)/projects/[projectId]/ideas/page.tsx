'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { IdeaCaptureModal } from '@/components/IdeaCaptureModal'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, usePromoteFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession } from '@/hooks/useSessions'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { useQueryClient } from '@tanstack/react-query'

export default function IdeasPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, 'ideas')
  const files = data ?? []
  const createFile = useCreateFile()
  const promoteFile = usePromoteFile()
  const launchSession = useLaunchSession()
  const { openWindow, bringToFront } = useSessionWindows()
  const qc = useQueryClient()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showCapture, setShowCapture] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view ideas.</p>
  }
  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>
  if (data === null || error) return <SetupPrompt dir="ideas" />

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
        // Refresh files to pick up updated frontmatter (session_id written by server)
        qc.invalidateQueries({ queryKey: ['files', selectedProject.id, 'ideas'] })
      }
    } catch {}
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">💡 Ideas</h1>
        <button
          onClick={() => setShowCapture(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Plus size={14} /> New Idea
        </button>
      </div>

      {files.length === 0 && (
        <p className="text-zinc-600 text-sm">No ideas yet. Create one to get started.</p>
      )}
      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="idea"
            onClick={() => setDrawerFile(f)}
            phaseSessionState={f.sessions.ideate}
            onLiveBadgeClick={() => {
              if (f.sessions.ideate.sessionId) bringToFront(f.sessions.ideate.sessionId)
            }}
            onViewLog={() => {
              if (f.sessions.ideate.logId) {
                setDrawerFile({
                  ...f,
                  path: f.sessions.ideate.logId,
                  title: `${f.title} — ideate log`,
                  content: '',
                })
              }
            }}
            onResume={() => startSession(f, 'ideate')}
            actions={[
              { label: '💡 Ideate', variant: 'primary', onClick: () => startSession(f, 'ideate') },
              { label: '📋 → Specs', onClick: () => promoteFile.mutate({ projectId: selectedProject.id, sourceFile: f.path, targetDir: 'specs' }) },
              { label: '📋 Create Spec', onClick: () => startSession(f, 'spec') },
              { label: '🚀 Start Developing', onClick: () => startSession(f, 'develop') },
            ]}
          />
        ))}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showCapture && (
        <IdeaCaptureModal
          onCancel={() => setShowCapture(false)}
          onConfirm={async ({ name, pitch }) => {
            try {
              const result = await createFile.mutateAsync({
                projectId: selectedProject.id,
                dir: 'ideas',
                name,
                pitch,
              })
              setShowCapture(false)
              if (result.path) {
                const newFile: MarkdownFile = {
                  filename: result.filename,
                  path: result.path,
                  title: name,
                  excerpt: pitch,
                  modifiedAt: new Date().toISOString(),
                  content: pitch ? `# ${name}\n\n${pitch}` : `# ${name}\n\n`,
                  sessions: {
                    ideate: { sessionId: null, logId: null },
                    spec: { sessionId: null, logId: null },
                    plan: { sessionId: null, logId: null },
                    develop: { sessionId: null, logId: null },
                  },
                }
                await startSession(newFile, 'ideate')
              }
            } catch {}
          }}
        />
      )}
    </>
  )
}
