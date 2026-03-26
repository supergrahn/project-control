'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { PromptModal } from '@/components/PromptModal'
import { SessionModal } from '@/components/SessionModal'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession, type Session } from '@/hooks/useSessions'
import { type Phase } from '@/lib/prompts'

export default function PlansPage() {
  const { selectedProject } = useProjectStore()
  const { data: files = [], isLoading, error } = useFiles(selectedProject?.id ?? null, 'plans')
  const createFile = useCreateFile()
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [promptConfig, setPromptConfig] = useState<{ phase: Phase; sourceFile: string; fileTitle: string } | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const launchSession = useLaunchSession()

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view plans.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if (error) {
    return <p className="text-zinc-500 text-sm">Plans folder not configured. Go to Settings to set it up.</p>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">🗺 Plans</h1>
        <button
          onClick={() => setShowNewDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
        >
          <Plus size={14} /> New Plan
        </button>
      </div>

      <CardGrid>
        {files.map((f) => (
          <MarkdownCard
            key={f.path}
            file={f}
            badge="plan"
            onClick={() => setDrawerFile(f)}
            actions={[
              { label: '🗺 Continue Planning', variant: 'primary', onClick: () => setPromptConfig({ phase: 'plan', sourceFile: f.path, fileTitle: f.title }) },
              { label: '🚀 Start Developing', onClick: () => setPromptConfig({ phase: 'develop', sourceFile: f.path, fileTitle: f.title }) },
            ]}
          />
        ))}
      </CardGrid>

      <FileDrawer file={drawerFile} onClose={() => setDrawerFile(null)} />

      {showNewDialog && (
        <NewFileDialog
          label="Plan"
          onCancel={() => setShowNewDialog(false)}
          onConfirm={async (name) => {
            try {
              await createFile.mutateAsync({ projectId: selectedProject.id, dir: 'plans', name })
              setShowNewDialog(false)
            } catch {
              // mutation failed — leave dialog open, user can retry
            }
          }}
        />
      )}

      {promptConfig && selectedProject && (
        <PromptModal
          phase={promptConfig.phase}
          sourceFile={promptConfig.sourceFile}
          onCancel={() => setPromptConfig(null)}
          onLaunch={async (userContext, permissionMode) => {
            const config = promptConfig
            setPromptConfig(null)
            try {
              const result = await launchSession.mutateAsync({
                projectId: selectedProject.id,
                phase: config.phase,
                sourceFile: config.sourceFile,
                userContext,
                permissionMode,
              })
              if (result.sessionId) {
                setActiveSession({
                  id: result.sessionId,
                  label: `${config.fileTitle} · ${config.phase}`,
                  phase: config.phase,
                  project_id: selectedProject.id,
                  source_file: config.sourceFile,
                  status: 'active',
                  created_at: new Date().toISOString(),
                })
              } else if (result.error === 'concurrent_session' && result.sessionId) {
                setActiveSession({
                  id: result.sessionId,
                  label: `${config.fileTitle} · ${config.phase}`,
                  phase: config.phase,
                  project_id: selectedProject.id,
                  source_file: config.sourceFile,
                  status: 'active',
                  created_at: new Date().toISOString(),
                })
              }
            } catch {}
          }}
        />
      )}
      <SessionModal session={activeSession} onClose={() => setActiveSession(null)} />
    </>
  )
}
