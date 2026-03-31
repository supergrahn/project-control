'use client'
import { useParams } from 'next/navigation'
import { useSessions } from '@/hooks/useSessions'
import { useTasks } from '@/hooks/useTasks'
import { useOrchestratorFeed } from '@/hooks/useOrchestratorFeed'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { stopSession } from '@/lib/sessionActions'
import { SessionAgentCard } from '@/components/dashboard/SessionAgentCard'
import { ActivityPanel } from '@/components/dashboard/ActivityPanel'

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: allSessions = [] } = useSessions({ status: 'active' })
  const { tasks } = useTasks(projectId)
  const { openWindow } = useSessionWindows()

  // Filter to this project only (the API doesn't filter active sessions by projectId)
  const activeSessions = allSessions.filter(s => s.project_id === projectId)

  const { feed } = useOrchestratorFeed(activeSessions)

  // Tasks that are not done — shown in Waiting grid
  const waitingTasks = tasks.filter(t => t.status !== 'done')

  const headingStyle: React.CSSProperties = {
    color: '#8a9199', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14,
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0, margin: -24 }}>
      {/* Main content */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* Live Sessions */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={headingStyle}>Live Sessions</div>
            {activeSessions.length > 0 && (
              <span style={{ background: '#3a8c5c', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 600 }}>
                {activeSessions.length}
              </span>
            )}
          </div>

          {activeSessions.length === 0 ? (
            <div style={{ color: '#5a6370', fontSize: 14, padding: '24px 0' }}>
              No active sessions — start one from the pipeline pages.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {activeSessions.map(session => {
                const sessionFeed = feed.filter(e => e.sessionId === session.id)
                return (
                  <SessionAgentCard
                    key={session.id}
                    session={session}
                    feedEntries={sessionFeed}
                    onStop={() => stopSession(session.id)}
                    onOpenTerminal={() => openWindow(session)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Waiting tasks */}
        {waitingTasks.length > 0 && (
          <div>
            <div style={headingStyle}>Waiting</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {waitingTasks.map(task => (
                <div key={task.id} style={{
                  background: '#141618', border: '1px solid #1e2124', borderRadius: 8,
                  padding: '12px 14px', fontFamily: 'system-ui, sans-serif',
                }}>
                  <div style={{ color: '#c8ced6', fontSize: 13, fontWeight: 600, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </div>
                  <div style={{ color: '#454c54', fontSize: 11 }}>{task.status}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity panel */}
      <ActivityPanel tasks={tasks} feed={feed} />
    </div>
  )
}
