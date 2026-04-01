'use client'
import { useState, useEffect } from 'react'
import { SessionLogViewer } from './SessionLogViewer'

type SessionRecord = {
  id: string
  task_id: string
  provider_type?: string
  created_at: string
  ended_at: string | null
  exit_reason: string | null
}

type SessionHistoryPanelProps = {
  taskId: string
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}

function getReasonColor(reason: string | null): string {
  switch (reason) {
    case 'completed':
      return '#00c875'
    case 'killed':
      return '#c8d0da'
    case 'error':
      return '#df2f4a'
    case 'rate_limit':
      return '#c97e2a'
    default:
      return '#8a9199'
  }
}

function getReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'completed':
      return 'Completed'
    case 'killed':
      return 'Stopped'
    case 'error':
      return 'Error'
    case 'rate_limit':
      return 'Rate Limited'
    default:
      return 'Ended'
  }
}

export function SessionHistoryPanel({ taskId }: SessionHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/tasks/${taskId}/sessions`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        setSessions(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Failed to fetch sessions:', err)
        setSessions([])
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [taskId])

  if (loading) {
    return (
      <div className="text-text-muted text-[12px] py-4 px-3 text-center">
        Loading session history...
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="text-text-muted text-[12px] py-4 px-3 text-center">
        No session history
      </div>
    )
  }

  return (
    <div className="border-t border-border-default pt-4">
      <div className="text-text-secondary text-[11px] font-semibold uppercase tracking-[0.04em] mb-3 px-3">
        Session History
      </div>

      {selectedSessionId ? (
        <div className="px-3 mb-3">
          <button
            onClick={() => setSelectedSessionId(null)}
            className="text-[11px] text-accent-blue hover:text-accent-blue/80 cursor-pointer"
          >
            Back to list
          </button>
        </div>
      ) : null}

      {selectedSessionId ? (
        <SessionLogViewer sessionId={selectedSessionId} />
      ) : (
        <div className="space-y-1 px-3">
          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => setSelectedSessionId(session.id)}
              className="w-full flex items-center justify-between gap-2 p-2 rounded-[6px] hover:bg-bg-secondary text-left transition-colors cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-text-primary">
                  {formatDate(session.created_at)}
                </div>
                {session.provider_type && (
                  <div className="text-[11px] text-text-muted">
                    {session.provider_type}
                  </div>
                )}
              </div>
              <div
                className="px-2 py-1 rounded text-[10px] font-medium text-bg-base shrink-0"
                style={{ backgroundColor: getReasonColor(session.exit_reason) }}
              >
                {getReasonLabel(session.exit_reason)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
