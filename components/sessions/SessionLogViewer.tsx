'use client'
import { useState, useEffect } from 'react'

type SessionLogEntry = {
  type: string
  created_at: string
  content?: string
  metadata?: Record<string, unknown>
  role?: string
}

type SessionLogViewerProps = {
  sessionId: string
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return dateStr.split('T')[1]?.split('.')[0] || dateStr
  }
}

function LogEntry({ entry }: { entry: SessionLogEntry }) {
  return (
    <div className="border-b border-border-default py-2 px-3 text-[11px] last:border-b-0">
      <div className="flex gap-2 mb-1">
        <span className="text-text-faint">{formatTime(entry.created_at)}</span>
        <span className="text-accent-blue font-medium">{entry.type}</span>
        {entry.role && <span className="text-text-muted">({entry.role})</span>}
      </div>
      {entry.content && (
        <div className="text-text-secondary ml-2 break-words whitespace-pre-wrap font-mono text-[10px]">
          {entry.content.substring(0, 500)}
          {entry.content.length > 500 ? '...' : ''}
        </div>
      )}
      {entry.metadata && (
        <div className="text-text-muted ml-2 text-[10px]">
          {JSON.stringify(entry.metadata).substring(0, 200)}
          {JSON.stringify(entry.metadata).length > 200 ? '...' : ''}
        </div>
      )}
    </div>
  )
}

export function SessionLogViewer({ sessionId }: SessionLogViewerProps) {
  const [entries, setEntries] = useState<SessionLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLog = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/sessions/${sessionId}/log`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        setEntries(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error('Failed to fetch log:', err)
        setEntries([])
      } finally {
        setLoading(false)
      }
    }

    fetchLog()
  }, [sessionId])

  const filtered = entries.filter(entry =>
    JSON.stringify(entry).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-2 px-3">
      <input
        type="text"
        placeholder="Search log..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-bg-secondary border border-border-default rounded-[6px] px-2.5 py-1.5 text-[12px] outline-none"
        style={{ color: '#c8d0da' }}
      />

      <div className="max-h-[400px] overflow-y-auto border border-border-default rounded-[6px] bg-bg-secondary">
        {loading && (
          <div className="text-text-muted text-[12px] py-4 text-center">
            Loading log...
          </div>
        )}
        {!loading && entries.length === 0 && (
          <div className="text-text-muted text-[12px] py-4 text-center">
            No log entries
          </div>
        )}
        {!loading && filtered.length === 0 && search && (
          <div className="text-text-muted text-[12px] py-4 text-center">
            No matching entries
          </div>
        )}
        {filtered.map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}
      </div>
    </div>
  )
}
