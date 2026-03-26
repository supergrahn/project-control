// app/(dashboard)/plans/page.tsx
'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { PromptModal } from '@/components/PromptModal'
import { SessionModal } from '@/components/SessionModal'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession, type Session } from '@/hooks/useSessions'
import { useAuditStatus, useRunAudit } from '@/hooks/useAudit'
import { type Phase } from '@/lib/prompts'

function auditBadge(status: { blockers: number; warnings: number } | undefined, running: boolean) {
  if (running) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400 animate-pulse">Auditing…</span>
  if (!status) return null
  if (status.blockers > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">🔴 {status.blockers} blocker{status.blockers !== 1 ? 's' : ''}</span>
  if (status.warnings > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">🟡 {status.warnings} warning{status.warnings !== 1 ? 's' : ''}</span>
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">🟢 Ready</span>
}

export default function PlansPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, 'plans')
  const files = data ?? []
  const createFile = useCreateFile()
  const { data: auditStatuses = {} } = useAuditStatus(selectedProject?.id ?? null)
  const runAudit = useRunAudit()
  const [auditingFile, setAuditingFile] = useState<string | null>(null)
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [promptConfig, setPromptConfig] = useState<{ phase: Phase; sourceFile: string; fileTitle: string } | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)
  const launchSession = useLaunchSession()

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view plans.</p>
  }

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading...</p>

  if (data === null || error) return <SetupPrompt dir="plans" />

  const handleAudit = async (f: MarkdownFile) => {
    if (auditingFile) return
    setAuditingFile(f.path)
    try {
      await runAudit.mutateAsync({ projectId: selectedProject.id, planFile: f.path })
    } finally {
      setAuditingFile(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">🗺 Plans</h1>
        <div className="flex items-center gap-2">
          {files.length > 0 && (
            <button
              onClick={async () => {
                for (const f of files) await handleAudit(f)
              }}
              disabled={!!auditingFile}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded disabled:opacity-50"
            >
              🔍 Audit All
            </button>
          )}
          <button
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded"
          >
            <Plus size={14} /> New Plan
          </button>
        </div>
      </div>

      {files.length === 0 && (
        <p className="text-zinc-600 text-sm">No plans yet. Create one or generate from a spec.</p>
      )}
      <CardGrid>
        {files.map((f) => {
          const basename = f.filename.replace(/\.md$/, '')
          const status = auditStatuses[basename]
          const isRunning = auditingFile === f.path
          return (
            <div key={f.path} className="flex flex-col">
              <MarkdownCard
                file={f}
                badge="plan"
                onClick={() => setDrawerFile(f)}
                actions={[
                  { label: '🗺 Continue Planning', variant: 'primary', onClick: () => setPromptConfig({ phase: 'plan', sourceFile: f.path, fileTitle: f.title }) },
                  { label: '🚀 Start Developing', onClick: () => setPromptConfig({ phase: 'develop', sourceFile: f.path, fileTitle: f.title }) },
                  { label: isRunning ? 'Auditing…' : '🔍 Audit', onClick: () => handleAudit(f) },
                ]}
              />
              {(status || isRunning) && (
                <div className="mt-1 flex justify-end">
                  {auditBadge(status, isRunning)}
                </div>
              )}
            </div>
          )
        })}
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
            } catch {}
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
                  ended_at: null,
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
