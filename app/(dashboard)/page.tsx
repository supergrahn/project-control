'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { useProjects, useProjectStore } from '@/hooks/useProjects'
import { useLaunchSession, type Session } from '@/hooks/useSessions'
import { PromptModal } from '@/components/PromptModal'
import { SessionModal } from '@/components/SessionModal'
import { formatDistanceToNow } from 'date-fns'
import type { Phase } from '@/lib/prompts'
import type { DashboardResponse } from '@/lib/dashboard'

const STAGE_COLORS: Record<string, string> = {
  develop: 'bg-green-500/20 text-green-300',
  plan: 'bg-violet-500/20 text-violet-300',
  spec: 'bg-blue-500/20 text-blue-300',
}

const STAGE_ACTIONS: Record<string, { label: string; route: string }> = {
  develop: { label: 'Start', route: '/plans' },
  plan: { label: 'Plan', route: '/plans' },
  spec: { label: 'Spec', route: '/specs' },
}

const AUDIT_BADGES: Record<string, string> = {
  blockers: '🔴',
  warnings: '🟡',
  clean: '🟢',
}

type ProjectLookup = Record<string, { id: string; name: string; path: string; ideas_dir: string | null; specs_dir: string | null; plans_dir: string | null; last_used_at: string | null }>

function InProgressBanner({ items, projectMap }: { items: DashboardResponse['inProgress']; projectMap: ProjectLookup }) {
  const { openProject } = useProjectStore()
  const router = useRouter()

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 mb-4">
      {items.map((s) => (
        <div
          key={s.sessionId}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/30 cursor-pointer hover:bg-violet-500/15 transition-colors"
          onClick={() => {
            const p = projectMap[s.projectId]
            if (p) { openProject(p); router.push('/developing') }
          }}
        >
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
          <span className="text-xs text-violet-300 font-semibold uppercase tracking-wider">In Progress</span>
          <span className="text-sm text-zinc-100 font-medium">{s.projectName}</span>
          <span className="text-sm text-zinc-400">{s.featureName}</span>
          <span className="text-xs text-zinc-500">{formatDistanceToNow(new Date(s.createdAt), { addSuffix: false })}</span>
          <span className="flex-1" />
          <span className="text-xs text-violet-400 flex items-center gap-1">Resume <ArrowRight size={12} /></span>
        </div>
      ))}
    </div>
  )
}

function UpNextTable({
  items, projectMap, onLaunchDevelop,
}: {
  items: DashboardResponse['upNext']
  projectMap: ProjectLookup
  onLaunchDevelop: (projectId: string, sourceFile: string, featureName: string) => void
}) {
  const { openProject } = useProjectStore()
  const router = useRouter()

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-10 text-center">
        <Activity size={28} className="text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm font-medium">All caught up — no actionable features across your projects</p>
      </div>
    )
  }

  const handleRowClick = (item: DashboardResponse['upNext'][0]) => {
    const p = projectMap[item.projectId]
    if (!p) return
    if (item.stage === 'develop') {
      onLaunchDevelop(item.projectId, item.filePath, item.featureName)
    } else {
      openProject(p)
      router.push(STAGE_ACTIONS[item.stage].route)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-100">Up Next — Ready to Continue</h2>
      </div>
      <div className="grid grid-cols-[1fr_120px_140px_80px] px-4 py-2 border-b border-zinc-800/50">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Feature</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Project</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Stage</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider" />
      </div>
      {items.map((item) => {
        const action = STAGE_ACTIONS[item.stage]
        return (
          <div
            key={`${item.projectId}-${item.featureName}`}
            className={`grid grid-cols-[1fr_120px_140px_80px] px-4 py-2.5 border-b border-zinc-800/30 cursor-pointer hover:bg-zinc-900/80 transition-colors items-center ${item.stale ? 'opacity-60' : ''}`}
            onClick={() => handleRowClick(item)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-100">{item.featureName}</span>
              {item.stale && <span className="text-[10px] text-zinc-500">⏸ stale</span>}
              {item.status === 'in-progress' && <span className="text-[10px] text-amber-400">in progress</span>}
            </div>
            <span className="text-xs text-zinc-400">{item.projectName}</span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[item.stage]}`}>{item.stage}</span>
              {item.auditStatus && <span className="text-xs">{AUDIT_BADGES[item.auditStatus]}</span>}
            </div>
            <span className="text-xs text-violet-400 flex items-center gap-1">{action.label} <ArrowRight size={10} /></span>
          </div>
        )
      })}
    </div>
  )
}

function BottomStrip({ pipeline, health, onHealthClick }: { pipeline: DashboardResponse['pipeline']; health: DashboardResponse['health']; onHealthClick?: (projectName: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Pipeline</span>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.ideas}</span> <span className="text-zinc-500">ideas</span></span>
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.specs}</span> <span className="text-zinc-500">specs</span></span>
          <span className="text-xs"><span className="text-zinc-100 font-semibold">{pipeline.plans}</span> <span className="text-zinc-500">plans</span></span>
          <span className="text-xs"><span className="text-violet-300 font-semibold">{pipeline.active}</span> <span className="text-zinc-500">active</span></span>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Audit Health</span>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-xs"><span className="text-red-400 font-semibold">{health.blockers}</span> <span className="text-zinc-500">🔴</span></span>
          <span className="text-xs"><span className="text-amber-300 font-semibold">{health.warnings}</span> <span className="text-zinc-500">🟡</span></span>
          <span className="text-xs"><span className="text-green-300 font-semibold">{health.clean}</span> <span className="text-zinc-500">🟢</span></span>
          {health.worst.length > 0 && (
            <span
              className="text-[10px] text-zinc-500 ml-2 cursor-pointer hover:text-zinc-300 transition-colors"
              onClick={() => onHealthClick?.(health.worst[0].projectName)}
            >
              Worst: <span className="text-red-400">{health.worst[0].projectName} · {health.worst[0].blockers} blockers</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard()
  const { data: projects = [] } = useProjects()
  const { openProject } = useProjectStore()
  const router = useRouter()
  const launchSession = useLaunchSession()

  const [promptConfig, setPromptConfig] = useState<{ projectId: string; sourceFile: string; featureName: string } | null>(null)
  const [activeSession, setActiveSession] = useState<Session | null>(null)

  const projectMap: ProjectLookup = Object.fromEntries(projects.map(p => [p.id, p]))

  if (isLoading) return <p className="text-zinc-500 text-sm">Loading dashboard…</p>
  if (isError || !data) return <p className="text-zinc-500 text-sm">Failed to load dashboard.</p>

  const handleLaunchDevelop = (projectId: string, sourceFile: string, featureName: string) => {
    const p = projectMap[projectId]
    if (p) openProject(p)
    setPromptConfig({ projectId, sourceFile, featureName })
  }

  return (
    <>
      <InProgressBanner items={data.inProgress} projectMap={projectMap} />
      <UpNextTable items={data.upNext} projectMap={projectMap} onLaunchDevelop={handleLaunchDevelop} />
      <BottomStrip
        pipeline={data.pipeline}
        health={data.health}
        onHealthClick={(projectName) => {
          const p = projects.find(p => p.name === projectName)
          if (p) { openProject(p); router.push('/plans') }
        }}
      />

      {promptConfig && (
        <PromptModal
          phase="develop"
          sourceFile={promptConfig.sourceFile}
          onCancel={() => setPromptConfig(null)}
          onLaunch={async (userContext, permissionMode, correctionNote) => {
            const config = promptConfig
            setPromptConfig(null)
            try {
              const result = await launchSession.mutateAsync({
                projectId: config.projectId,
                phase: 'develop',
                sourceFile: config.sourceFile,
                userContext,
                permissionMode,
                correctionNote,
              })
              if (result.sessionId) {
                setActiveSession({
                  id: result.sessionId,
                  label: `${config.featureName} · develop`,
                  phase: 'develop',
                  project_id: config.projectId,
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
