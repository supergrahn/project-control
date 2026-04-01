'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useTasks } from '@/hooks/useTasks'
import { useSessions } from '@/hooks/useSessions'

import { STATUS_TO_SESSION_PHASES } from '@/lib/taskPhaseConfig'
import { NewProjectWizard } from '@/components/projects/NewProjectWizard'

const fetcher = (url: string) => fetch(url).then(r => r.json())

type GitInfo = { branch: string; lastCommit: string; uncommitted: number }
type Me = { name: string; initials: string }

type Props = { projectId: string; projectName: string; projectPath: string }

const PIPELINE_ITEMS = [
  { label: 'Ideas',      status: 'idea'       as const, route: 'ideas' },
  { label: 'Specs',      status: 'speccing'   as const, route: 'specs' },
  { label: 'Plans',      status: 'planning'   as const, route: 'plans' },
  { label: 'Developing', status: 'developing' as const, route: 'developing' },
  { label: 'Done',       status: 'done'       as const, route: 'done' },
]

export const DOT_COLORS = ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']

export function Sidebar({ projectId, projectName, projectPath }: Props) {
  const pathname = usePathname()
  const [showAddProject, setShowAddProject] = useState(false)
  const { data: git } = useSWR<GitInfo>(`/api/projects/${projectId}/git-info`, fetcher, { refreshInterval: 10000 })
  const [me, setMe] = useState<Me | null>(null)
  const { data: allSessions = [] } = useSessions({ status: 'active' })

  const activeSessions = allSessions.filter(s => s.project_id === projectId)
  const liveCount = activeSessions.length

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => null)
  }, [])

  return (
    <>
      <div className="w-[240px] bg-bg-base border-r border-border-default flex flex-col flex-shrink-0 h-screen sticky top-0 overflow-hidden">
        {/* App header */}
        <div className="px-[14px] pt-[14px] pb-[10px] border-b border-border-default">
          <div className="text-text-primary font-bold text-[13px] tracking-[-0.2px]">
            Project Control
          </div>
        </div>

        {/* Primary nav */}
        <div className="px-2 pt-2 pb-1">
          <NavItem
            href={`/projects/${projectId}`}
            active={pathname === `/projects/${projectId}` || pathname === `/projects/${projectId}/dashboard`}
            badge={liveCount > 0 ? liveCount : undefined}
            badgeColor="#3a8c5c"
          >
            Dashboard
          </NavItem>
          <NavItem href="/inbox" active={pathname === '/inbox'}>
            Inbox
          </NavItem>
        </div>

        {/* Pipeline section */}
        <div className="px-2 py-1.5 flex-1 overflow-y-auto">
          <SectionLabel>Pipeline</SectionLabel>
          {PIPELINE_ITEMS.map(item => (
            <PipelineNavItem
              key={item.status}
              projectId={projectId}
              item={item}
              active={pathname.includes(`/projects/${projectId}/${item.route}`)}
              activeSessions={activeSessions}
            />
          ))}

          {/* Team section */}
          <div className="mt-4 pt-3 border-t border-border-default">
            <SectionLabel>Team</SectionLabel>
            <NavItem
              href={`/projects/${projectId}/agents`}
              active={pathname.startsWith(`/projects/${projectId}/agents`)}
            >
              Agents
            </NavItem>
            <NavItem
              href={`/projects/${projectId}/skills`}
              active={pathname.startsWith(`/projects/${projectId}/skills`)}
            >
              Skills
            </NavItem>
          </div>

          {/* Project section */}
          <div className="mt-4 pt-3 border-t border-border-default">
            <SectionLabel>Project</SectionLabel>
            <NavItem
              href={`/projects/${projectId}/settings`}
              active={pathname.startsWith(`/projects/${projectId}/settings`)}
            >
              Settings
            </NavItem>
          </div>
        </div>

        {/* Git info */}
        <div className="px-3 py-2 border-t border-border-default bg-[#0a0c0e]">
          <Row label="branch" value={git?.branch ?? '…'} valueColor="text-accent-blue" mono />
          <Row label="last commit" value={git?.lastCommit ?? '…'} />
        </div>

        {/* Bottom: Add Project + user avatar */}
        <div className="border-t border-border-default">
          <button
            onClick={() => setShowAddProject(true)}
            className="block w-full px-[14px] py-[10px] bg-none border-none text-text-muted text-[12px] text-left cursor-pointer border-b border-border-default"
          >
            + Add Project
          </button>
          {me && (
            <div className="flex items-center gap-2 px-[14px] py-[10px]">
              <div className="w-6 h-6 rounded-full bg-[#1a2530] flex items-center justify-center text-accent-blue text-[9px] font-bold flex-shrink-0">
                {me.initials}
              </div>
              <span className="text-text-muted text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">
                {me.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {showAddProject && <NewProjectWizard onClose={() => setShowAddProject(false)} />}
    </>
  )
}

function NavItem({ href, active, badge, badgeColor, children }: {
  href: string; active: boolean; badge?: number; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <Link href={href} className="no-underline">
      <div className={`flex items-center justify-between px-2 py-1.5 rounded border-l-2 mb-0.5 ${
        active ? 'bg-bg-secondary border-l-accent-blue' : 'bg-transparent border-l-transparent'
      }`}>
        <span className={`text-[14px] ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{children}</span>
        {badge !== undefined && (
          <span style={{ background: badgeColor ?? '#1c1f22', color: '#fff' }} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
            {badge}
          </span>
        )}
      </div>
    </Link>
  )
}

function PipelineNavItem({ projectId, item, active, activeSessions }: {
  projectId: string
  item: typeof PIPELINE_ITEMS[number]
  active: boolean
  activeSessions: { phase: string }[]
}) {
  const { tasks } = useTasks(projectId, item.status)
  const hasLive = activeSessions.some(s => (STATUS_TO_SESSION_PHASES[item.status] ?? []).includes(s.phase))

  return (
    <Link href={`/projects/${projectId}/${item.route}`} className="no-underline">
      <div className={`flex items-center justify-between px-2 py-1.25 rounded mb-0.5 ${
        active ? 'bg-bg-secondary' : 'bg-transparent'
      }`}>
        <span className={`text-[13px] ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{item.label}</span>
        <span className="flex items-center gap-1">
          {hasLive && <span className="w-1.25 h-1.25 rounded-full bg-accent-green inline-block" />}
          <span style={{ background: tasks.length > 0 ? '#1a2530' : '#141618', color: tasks.length > 0 ? '#5b9bd5' : '#2e3338' }} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
            {tasks.length}
          </span>
        </span>
      </div>
    </Link>
  )
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between mb-0.75">
      <span className="text-text-faint text-[10px]">{label}</span>
      <span style={{ color: valueColor ?? '#5a6370', fontSize: 10, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-text-faint text-[10px] uppercase tracking-[0.5px] px-2 py-1 pt-1">
      {children}
    </div>
  )
}
