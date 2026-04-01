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

  return (
    <div className="flex h-full gap-0 -m-6">
      {/* Main content */}
      <div className="flex-1 p-6 overflow-y-auto">

        {/* Live Sessions */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="text-text-secondary text-xs font-semibold uppercase tracking-wide">Live Sessions</div>
            {activeSessions.length > 0 && (
              <span className="bg-accent-green text-white rounded-pill py-0.25 px-1.75 text-xs font-semibold">
                {activeSessions.length}
              </span>
            )}
          </div>

          {activeSessions.length === 0 ? (
            <div className="text-text-muted text-base py-6">
              No active sessions — start one from the pipeline pages.
            </div>
          ) : (
            <div className="grid grid-cols-auto-fill gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
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
            <div className="text-text-secondary text-xs font-semibold uppercase tracking-wide mb-3.5">Waiting</div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {waitingTasks.map(task => (
                <div key={task.id} className="bg-bg-secondary border border-border-subtle rounded-lg px-3.5 py-3">
                  <div className="text-gray-300 text-sm font-semibold mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
                    {task.title}
                  </div>
                  <div className="text-text-faint text-xs">{task.status}</div>
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
