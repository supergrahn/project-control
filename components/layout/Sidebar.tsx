'use client'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, Radio } from 'lucide-react'
import { useSessions, type Session } from '@/hooks/useSessions'

import { NewProjectWizard } from '@/components/projects/NewProjectWizard'
import { StartSessionModal } from '@/components/sessions/StartSessionModal'
import { fetcher } from '@/lib/fetcher'

type GitInfo = { branch: string; lastCommit: string; uncommitted: number }
type Me = { name: string; initials: string }
type Agent = { id: string; name: string; status: string }
type Skill = { id: string; name: string; key: string }

type Props = {
  projectId: string
  projectName: string
  projectPath: string
  specsDir?: string | null
  plansDir?: string | null
}

export const DOT_COLORS = ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']

export function Sidebar({ projectId, projectPath, specsDir = null, plansDir = null }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [showAddProject, setShowAddProject] = useState(false)
  const [showStartSession, setShowStartSession] = useState(false)
  const { data: git } = useSWR<GitInfo>(`/api/projects/${projectId}/git-info`, fetcher, { refreshInterval: 10000 })
  const [me, setMe] = useState<Me | null>(null)
  const { data: allSessions = [] } = useSessions({ status: 'active' })

  const activeSessions = allSessions.filter(s => s.project_id === projectId)
  // The list includes needs_route_retry too — only count truly running sessions
  // for the "live" badge so stuck sessions don't inflate the green chip.
  const liveCount = activeSessions.filter(s => s.status === 'active').length
  const { data: agents = [] } = useSWR<Agent[]>(`/api/agents?projectId=${projectId}`, fetcher)
  const { data: skills = [] } = useSWR<Skill[]>(`/api/skills?projectId=${projectId}`, fetcher)

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

        {/* Global nav */}
        <div className="px-2 pt-2 pb-1">
          <SectionLabel>Global</SectionLabel>
          <NavItem href="/briefing" active={pathname === '/briefing'}>
            Briefing
          </NavItem>
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
          <NavItem href={`/projects/${projectId}/docs`} active={pathname === `/projects/${projectId}/docs`}>
            Docs
          </NavItem>
          <NavItem href={`/projects/${projectId}/inbox`} active={pathname === `/projects/${projectId}/inbox`}>
            Inbox
          </NavItem>
          <NavItem
            href={`/projects/${projectId}/tasks`}
            active={pathname.startsWith(`/projects/${projectId}/tasks`)}
          >
            Tasks
          </NavItem>
        </div>

        {/* Pipeline section */}
        <div className="px-2 py-1.5 flex-1 overflow-y-auto">
          <div className="mb-4">
            <div className="flex items-center justify-between px-2 py-1 pt-1">
              <span className="text-text-faint text-[10px] uppercase tracking-[0.5px]">Active Sessions</span>
              {liveCount > 0 && (
                <span className="text-[10px] text-accent-green font-semibold">{liveCount}</span>
              )}
            </div>
            <div className="min-h-[128px] flex flex-col">
              <div className="flex-1">
                {activeSessions.map(session => (
                  <SelectedSessionHighlightIndicator key={session.id} sessionId={session.id}>
                    {(isSelected) => (
                      <ActiveSessionItem
                        session={session}
                        onOpen={() => router.push('/sessions?selected=' + session.id)}
                        isSelected={isSelected}
                      />
                    )}
                  </SelectedSessionHighlightIndicator>
                ))}
                {activeSessions.length === 0 && (
                  <div className="px-2 py-3 text-[11px] text-text-faint">No active sessions</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowStartSession(true)}
                className="mt-1 w-full h-8 flex items-center justify-center rounded-[6px] border border-border-default bg-bg-secondary text-text-muted hover:text-text-primary hover:bg-bg-tertiary cursor-pointer"
                aria-label="Start session"
                title="Start session"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* Agents section */}
          <div className="mt-4 pt-3 border-t border-border-default">
            <SectionLabelWithAction
              label="Agents"
              href={`/projects/${projectId}/agents`}
            />
            {agents.map(agent => (
              <NavItem
                key={agent.id}
                href={`/projects/${projectId}/agents/${agent.id}`}
                active={pathname === `/projects/${projectId}/agents/${agent.id}`}
              >
                {agent.name}
              </NavItem>
            ))}
            {agents.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-text-faint">No agents yet</div>
            )}
          </div>

          {/* Skills section */}
          <div className="mt-4 pt-3 border-t border-border-default">
            <SectionLabelWithAction
              label="Skills"
              href={`/projects/${projectId}/skills`}
            />
            {skills.map(skill => (
              <NavItem
                key={skill.id}
                href={`/projects/${projectId}/skills`}
                active={false}
              >
                {skill.name}
              </NavItem>
            ))}
            {skills.length === 0 && (
              <div className="px-2 py-1 text-[11px] text-text-faint">No skills yet</div>
            )}
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
      {showStartSession && (
        <StartSessionModal
          projectId={projectId}
          projectPath={projectPath}
          specsDir={specsDir}
          plansDir={plansDir}
          onClose={() => setShowStartSession(false)}
        />
      )}
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
        <span className={`text-[13px] font-semibold ${active ? 'text-text-primary' : 'text-text-secondary'}`}>{children}</span>
        {badge !== undefined && (
          <span style={{ background: badgeColor ?? '#1c1f22', color: '#fff' }} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold">
            {badge}
          </span>
        )}
      </div>
    </Link>
  )
}

function ActiveSessionItem({ session, onOpen, isSelected = false }: { session: Session; onOpen: () => void; isSelected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-[6px] mb-0.5 hover:bg-bg-secondary text-left cursor-pointer ${
        isSelected ? 'bg-bg-tertiary' : 'bg-transparent'
      }`}
    >
      <Radio size={12} className="text-accent-green flex-shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-text-secondary truncate">{session.label}</span>
        <span className="block text-[10px] text-text-faint truncate">{session.phase}</span>
      </span>
    </button>
  )
}

function SelectedSessionHighlightIndicator({ sessionId, children }: { sessionId: string; children: (isSelected: boolean) => React.ReactNode }) {
  const pathname = usePathname()
  return (
    <Suspense fallback={children(false)}>
      <SelectedSessionInner pathname={pathname} sessionId={sessionId}>{children}</SelectedSessionInner>
    </Suspense>
  )
}

function SelectedSessionInner({ pathname, sessionId, children }: { pathname: string; sessionId: string; children: (isSelected: boolean) => React.ReactNode }) {
  const searchParams = useSearchParams()
  const selected = pathname === '/sessions' ? searchParams?.get('selected') : null
  return <>{children(selected === sessionId)}</>
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between mb-0.75">
      <span className="text-text-faint text-[10px]">{label}</span>
      <span style={{ color: valueColor ?? '#5a6370', fontSize: 10, fontFamily: mono ? 'var(--font-mono)' : undefined }}>{value}</span>
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

function SectionLabelWithAction({ label, href }: { label: string; href: string }) {
  return (
    <div className="flex items-center justify-between px-2 py-1 pt-1">
      <span className="text-text-faint text-[10px] uppercase tracking-[0.5px]">{label}</span>
      <Link href={href} className="text-text-faint text-[13px] no-underline hover:text-text-secondary leading-none">+</Link>
    </div>
  )
}
