'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useTasks } from '@/hooks/useTasks'
import { useSessions } from '@/hooks/useSessions'
import { useProjects } from '@/hooks/useProjects'
import { STATUS_TO_SESSION_PHASES } from '@/lib/taskPhaseConfig'
import { NewProjectModal } from '@/components/projects/NewProjectModal'

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

const DOT_COLORS = ['#5b9bd5', '#3a8c5c', '#8f77c9', '#c97e2a', '#c04040']

export function Sidebar({ projectId, projectName, projectPath }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [showAddProject, setShowAddProject] = useState(false)
  const { data: git } = useSWR<GitInfo>(`/api/projects/${projectId}/git-info`, fetcher, { refreshInterval: 10000 })
  const [me, setMe] = useState<Me | null>(null)
  const { data: allProjects = [] } = useProjects()
  const { data: allSessions = [] } = useSessions({ status: 'active' })

  const activeSessions = allSessions.filter(s => s.project_id === projectId)
  const liveCount = activeSessions.length

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(setMe).catch(() => null)
  }, [])

  const sidebarStyle: React.CSSProperties = {
    width: 200,
    background: '#0c0e10',
    borderRight: '1px solid #1c1f22',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    height: '100vh',
    position: 'sticky',
    top: 0,
    overflow: 'hidden',
  }

  return (
    <>
      <div style={sidebarStyle}>
        {/* App header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1c1f22' }}>
          <div style={{ color: '#e2e6ea', fontWeight: 700, fontSize: 13, letterSpacing: '-0.2px' }}>
            Project Control
          </div>
        </div>

        {/* Primary nav */}
        <div style={{ padding: '8px 8px 4px' }}>
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
        <div style={{ padding: '6px 8px', flex: 1, overflowY: 'auto' }}>
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
        </div>

        {/* Git info */}
        <div style={{ padding: '8px 12px', borderTop: '1px solid #1c1f22', background: '#0a0c0e' }}>
          <Row label="branch" value={git?.branch ?? '…'} valueColor="#5b9bd5" mono />
          <Row label="last commit" value={git?.lastCommit ?? '…'} />
        </div>

        {/* Projects section */}
        <div style={{ padding: '8px 8px 4px', borderTop: '1px solid #1c1f22' }}>
          <SectionLabel>Projects</SectionLabel>
          {allProjects.slice(0, 6).map((p, i) => (
            <button
              key={p.id}
              onClick={() => router.push(`/projects/${p.id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                background: p.id === projectId ? '#1c1f22' : 'none',
                border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
                textAlign: 'left', marginBottom: 1,
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: DOT_COLORS[i % DOT_COLORS.length],
              }} />
              <span style={{
                color: p.id === projectId ? '#e2e6ea' : '#8a9199', fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{p.name}</span>
            </button>
          ))}
        </div>

        {/* Bottom: Add Project + user avatar */}
        <div style={{ borderTop: '1px solid #1c1f22' }}>
          <button
            onClick={() => setShowAddProject(true)}
            style={{
              display: 'block', width: '100%', padding: '10px 14px', background: 'none',
              border: 'none', color: '#5a6370', fontSize: 12, textAlign: 'left',
              cursor: 'pointer', borderBottom: '1px solid #1c1f22',
            }}
          >
            + Add Project
          </button>
          {me && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', background: '#1a2530',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#5b9bd5', fontSize: 9, fontWeight: 700, flexShrink: 0,
              }}>
                {me.initials}
              </div>
              <span style={{ color: '#5a6370', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {me.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {showAddProject && <NewProjectModal onClose={() => setShowAddProject(false)} />}
    </>
  )
}

function NavItem({ href, active, badge, badgeColor, children }: {
  href: string; active: boolean; badge?: number; badgeColor?: string; children: React.ReactNode
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', borderRadius: 6, marginBottom: 1,
        background: active ? '#1c1f22' : 'none',
        borderLeft: active ? '2px solid #5b9bd5' : '2px solid transparent',
      }}>
        <span style={{ color: active ? '#e2e6ea' : '#8a9199', fontSize: 13 }}>{children}</span>
        {badge !== undefined && (
          <span style={{
            background: badgeColor ?? '#1c1f22', color: '#fff',
            padding: '1px 6px', borderRadius: 10, fontSize: 10, fontWeight: 600,
          }}>{badge}</span>
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
    <Link href={`/projects/${projectId}/${item.route}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 8px', borderRadius: 6, marginBottom: 1,
        background: active ? '#1c1f22' : 'transparent',
      }}>
        <span style={{ color: active ? '#e2e6ea' : '#8a9199', fontSize: 12 }}>{item.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3a8c5c', display: 'inline-block' }} />}
          <span style={{ background: '#1c1f22', color: '#454c54', padding: '1px 5px', borderRadius: 10, fontSize: 10 }}>
            {tasks.length}
          </span>
        </span>
      </div>
    </Link>
  )
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ color: '#454c54', fontSize: 10 }}>{label}</span>
      <span style={{ color: valueColor ?? '#5a6370', fontSize: 10, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#2e3338', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '4px 8px 6px' }}>
      {children}
    </div>
  )
}
