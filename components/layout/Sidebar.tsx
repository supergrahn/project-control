'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { useTasks } from '@/hooks/useTasks'
import { STATUS_TO_SESSION_PHASES } from '@/lib/taskPhaseConfig'

type GitInfo = { branch: string; lastCommit: string; uncommitted: number }
type Session = { id: string; label: string; phase: string; created_at: string; task_id: string | null }

const fetcher = (url: string) => fetch(url).then(r => r.json())

type Props = {
  projectId: string
  projectName: string
  projectPath: string
}

const PHASE_ITEMS = [
  { label: 'Ideas',      status: 'idea',       icon: '💡', color: '#5b9bd5' },
  { label: 'Specs',      status: 'speccing',   icon: '📐', color: '#3a8c5c' },
  { label: 'Plans',      status: 'planning',   icon: '📋', color: '#8f77c9' },
  { label: 'Developing', status: 'developing', icon: '⚙️', color: '#c97e2a' },
  { label: 'Done',       status: 'done',       icon: '✓',  color: '#3a8c5c' },
] as const

export function Sidebar({ projectId, projectName, projectPath }: Props) {
  const pathname = usePathname()
  const { data: git } = useSWR<GitInfo>(`/api/projects/${projectId}/git-info`, fetcher, { refreshInterval: 10000 })
  const { data: sessions } = useSWR<Session[]>(`/api/sessions/active?projectId=${projectId}`, fetcher, { refreshInterval: 3000 })

  const activeSessions = sessions ?? []

  return (
    <div style={{
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
    }}>

      {/* Project switcher */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1c1f22' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: '#1a2530', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🗂</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#e2e6ea', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName}</div>
            <div style={{ color: '#454c54', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectPath}</div>
          </div>
        </div>
      </div>

      {/* Git context */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1c1f22', background: '#0a0c0e' }}>
        <Row label="branch" value={git?.branch ?? '…'} valueColor="#5b9bd5" mono />
        <Row label="last commit" value={git?.lastCommit ?? '…'} />
        <Row label="uncommitted" value={git?.uncommitted != null ? String(git.uncommitted) + ' files' : '…'} valueColor={git?.uncommitted ? '#c97e2a' : undefined} />
      </div>

      {/* Pipeline nav */}
      <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #1c1f22', flex: 1, overflowY: 'auto' }}>
        <SectionLabel>Pipeline</SectionLabel>
        {PHASE_ITEMS.map(item => (
          <PipelineItem
            key={item.status}
            projectId={projectId}
            item={item}
            active={pathname.includes(`/${item.status === 'idea' ? 'ideas' : item.status === 'speccing' ? 'specs' : item.status === 'planning' ? 'plans' : item.status === 'developing' ? 'developing' : 'done'}`)}
            hasLive={activeSessions.some(s => (STATUS_TO_SESSION_PHASES[item.status] ?? []).includes(s.phase))}
          />
        ))}
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #1c1f22' }}>
          <SectionLabel>Active Sessions</SectionLabel>
          {activeSessions.map(s => (
            <div key={s.id} style={{ padding: '6px 8px', borderRadius: 6, background: '#160f04', border: '1px solid #c97e2a22', marginBottom: 4, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#c97e2a', display: 'inline-block' }} />
                <span style={{ color: '#c97e2a', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              </div>
              <div style={{ color: '#6b5c40', fontSize: 10, fontFamily: 'monospace' }}>{s.phase}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom tools */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #1c1f22' }}>
        {[
          { href: `/projects/${projectId}/memory`, label: '🧠 Memory' },
          { href: `/projects/${projectId}/search`, label: '🔍 Search' },
          { href: `/projects/${projectId}/settings`, label: '⚙️ Settings' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{ display: 'block', padding: '5px 8px', borderRadius: 6, color: '#5a6370', fontSize: 12, textDecoration: 'none' }}>
            {label}
          </Link>
        ))}
      </div>

    </div>
  )
}

function Row({ label, value, valueColor, mono }: { label: string; value: string; valueColor?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: '#454c54', fontSize: 10 }}>{label}</span>
      <span style={{ color: valueColor ?? '#5a6370', fontSize: 10, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ color: '#2e3338', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{children}</div>
}

function PipelineItem({ projectId, item, active, hasLive }: {
  projectId: string
  item: typeof PHASE_ITEMS[number]
  active: boolean
  hasLive: boolean
}) {
  const { tasks } = useTasks(projectId, item.status)
  const routeMap: Record<string, string> = {
    idea: 'ideas', speccing: 'specs', planning: 'plans', developing: 'developing', done: 'done'
  }
  const route = routeMap[item.status]

  return (
    <Link href={`/projects/${projectId}/${route}`} style={{ textDecoration: 'none' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '5px 8px',
        borderRadius: 6,
        background: active ? '#1c1f22' : 'transparent',
        marginBottom: 1,
      }}>
        <span style={{ color: active ? '#e2e6ea' : '#8a9199', fontSize: 12 }}>{item.icon} {item.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {hasLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: item.color, display: 'inline-block' }} />}
          <span style={{ background: '#1c1f22', color: '#454c54', padding: '1px 6px', borderRadius: 10, fontSize: 10 }}>{tasks.length}</span>
        </span>
      </div>
    </Link>
  )
}
