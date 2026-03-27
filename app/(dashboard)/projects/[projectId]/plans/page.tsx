// app/(dashboard)/plans/page.tsx
'use client'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { CardGrid } from '@/components/CardGrid'
import { MarkdownCard } from '@/components/cards/MarkdownCard'
import { FileDrawer } from '@/components/FileDrawer'
import { NewFileDialog } from '@/components/NewFileDialog'
import { SetupPrompt } from '@/components/SetupPrompt'
import { useFiles, useCreateFile, type MarkdownFile } from '@/hooks/useFiles'
import { useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession } from '@/hooks/useSessions'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { useAuditStatus, useRunAudit } from '@/hooks/useAudit'

const DIR = 'plans'

function auditBadge(status: { blockers: number; warnings: number } | undefined, running: boolean) {
  if (running) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400 animate-pulse">Auditing…</span>
  if (!status) return null
  if (status.blockers > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">🔴 {status.blockers} blocker{status.blockers !== 1 ? 's' : ''}</span>
  if (status.warnings > 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">🟡 {status.warnings} warning{status.warnings !== 1 ? 's' : ''}</span>
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-300">🟢 Ready</span>
}

export default function PlansPage() {
  const { selectedProject } = useProjectStore()
  const { data, isLoading, error } = useFiles(selectedProject?.id ?? null, DIR)
  const files = data ?? []
  const createFile = useCreateFile()
  const { data: auditStatuses = {} } = useAuditStatus(selectedProject?.id ?? null)
  const runAudit = useRunAudit()
  const launchSession = useLaunchSession()
  const { openWindow, bringToFront } = useSessionWindows()
  const qc = useQueryClient()
  const [auditingFile, setAuditingFile] = useState<string | null>(null)
  const [drawerFile, setDrawerFile] = useState<MarkdownFile | null>(null)
  const [showNewDialog, setShowNewDialog] = useState(false)

  if (!selectedProject) {
    return <p className="text-zinc-500 text-sm">Select a project to view plans.</p>
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
                phaseSessionState={f.sessions.plan}
                onLiveBadgeClick={() => { if (f.sessions.plan.sessionId) bringToFront(f.sessions.plan.sessionId) }}
                onViewLog={() => { if (f.sessions.plan.logId) setDrawerFile({ ...f, path: f.sessions.plan.logId, title: `${f.title} — plan log`, content: '' }) }}
                onResume={() => startSession(f, 'plan')}
                actions={[
                  { label: '📋 Plan', variant: 'primary', onClick: () => startSession(f, 'plan') },
                  { label: '🚀 Start Developing', onClick: () => startSession(f, 'develop') },
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
              await createFile.mutateAsync({ projectId: selectedProject.id, dir: DIR, name })
              setShowNewDialog(false)
            } catch {}
          }}
        />
      )}
    </>
  )
}
