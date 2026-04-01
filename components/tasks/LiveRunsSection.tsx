'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSessionWindows } from '@/hooks/useSessionWindows'
import { SessionInput } from './SessionInput'

type Todo = { id: string; content: string; status: 'completed' | 'in_progress' | 'pending' }

type SessionShape = {
  id: string
  project_id: string
  task_id: string
  label: string
  phase: string
  status: string
  created_at: string
  ended_at: string | null
}

type LogLine = { id: number; text: string }

const TOOL_COLOR_MAP: Record<string, string> = {
  Write: '#8f77c9',
  Edit: '#8f77c9',
  Bash: '#5b9bd5',
  Read: '#5a6370',
  Glob: '#5a6370',
  Grep: '#5a6370',
}

function getLineColor(text: string): string {
  for (const tool of Object.keys(TOOL_COLOR_MAP)) {
    if (text.startsWith(`${tool} ·`)) return TOOL_COLOR_MAP[tool]
  }
  return '#8a9199'
}

type Props = {
  taskId: string
  onTodos: (todos: Todo[]) => void
}

export function LiveRunsSection({ taskId, onTodos }: Props) {
  const [activeSession, setActiveSession] = useState<SessionShape | null>(null)
  const [logLines, setLogLines] = useState<LogLine[]>([])
  const [stopping, setStopping] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const lineCounter = useRef(0)
  const onTodosRef = useRef(onTodos)
  useEffect(() => { onTodosRef.current = onTodos })
  const { openWindow } = useSessionWindows()
  const wsRef = useRef<WebSocket | null>(null)

  // Fetch active session on mount
  useEffect(() => {
    fetch(`/api/sessions?taskId=${taskId}&status=active`)
      .then((r) => r.json())
      .then((data: SessionShape[]) => {
        setActiveSession(data[0] ?? null)
      })
      .catch(() => setActiveSession(null))
  }, [taskId])

  // Open WebSocket when there is an active session
  useEffect(() => {
    if (!activeSession?.id) return
    const ws = new WebSocket(`ws://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'attach', sessionId: activeSession.id }))
    }

    ws.onmessage = (e: MessageEvent) => {
      const text: string = typeof e.data === 'string' ? e.data : ''

      let parsed: any
      try {
        parsed = JSON.parse(text)
      } catch {
        // Non-JSON — treat as raw output
        const newLine: LogLine = { id: ++lineCounter.current, text }
        setLogLines((prev) => [...prev.slice(-499), newLine])
        return
      }

      if (parsed?.type === 'status' && parsed?.state === 'ended') {
        setActiveSession(null)
        onTodosRef.current([])
        return
      }

      if (parsed?.type === 'output') {
        const lineText = parsed.data ?? ''
        // Try TodoWrite match on output lines
        const todoMatch = lineText.match(/^TodoWrite\s+·\s+(\[.+\])/s)
        if (todoMatch) {
          try {
            const todos: Todo[] = JSON.parse(todoMatch[1])
            onTodosRef.current(todos)
          } catch {}
        }
        const newLine: LogLine = { id: ++lineCounter.current, text: lineText }
        setLogLines((prev) => [...prev.slice(-499), newLine])
        return
      }

      // Ignore 'event' and 'rate_limit' messages for now — output covers display
    }

    ws.onerror = () => {
      setActiveSession(null)
    }

    return () => { ws.close(); wsRef.current = null }
  }, [activeSession?.id])

  // Scroll to bottom when log lines change
  useEffect(() => {
    if (typeof logEndRef.current?.scrollIntoView === 'function') {
      logEndRef.current.scrollIntoView()
    }
  }, [logLines])

  const handleStop = useCallback(async () => {
    if (!activeSession || stopping) return
    setStopping(true)
    try {
      await fetch(`/api/sessions/${activeSession.id}`, { method: 'DELETE' })
      setActiveSession(null)
    } catch {
      // ignore — session may already be gone
    } finally {
      setStopping(false)
    }
  }, [activeSession, stopping])

  function handleOpenTerminal() {
    if (!activeSession) return
    openWindow({
      id: activeSession.id,
      project_id: activeSession.project_id,
      label: activeSession.label,
      phase: activeSession.phase,
      source_file: null,
      status: activeSession.status,
      created_at: activeSession.created_at,
      ended_at: activeSession.ended_at,
    })
  }

  function handleSendInput(text: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: text }))
    }
  }

  if (!activeSession) {
    return (
      <div style={{ color: '#5a6370', fontSize: 12, padding: '10px 0' }}>No active run</div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#e2e6ea', fontSize: 13, fontWeight: 600 }}>{activeSession.label}</span>
        <span style={{ color: '#5a6370', fontSize: 11, background: '#141618', border: '1px solid #1c1f22', borderRadius: 4, padding: '1px 6px' }}>
          {activeSession.phase}
        </span>
      </div>

      {/* Terminal panel */}
      <div style={{
        background: '#080909',
        borderRadius: 6,
        padding: '8px 10px',
        maxHeight: 240,
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: 11,
        marginBottom: 8,
      }}>
        {logLines.length === 0 && (
          <div style={{ color: '#454c54' }}>Waiting for output…</div>
        )}
        {logLines.map((line) => (
          <div key={line.id} style={{ color: getLineColor(line.text) }}>{line.text}</div>
        ))}
        <div ref={logEndRef} />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={handleOpenTerminal}
          style={{ flex: 1, background: '#0e1012', color: '#5b9bd5', border: '1px solid #1c1f2244', borderRadius: 6, padding: '5px 0', fontSize: 11, cursor: 'pointer' }}
        >
          Open Terminal
        </button>
        <button
          onClick={handleStop}
          disabled={stopping}
          style={{ background: '#1c1f22', color: stopping ? '#5a6370' : '#c97e2a', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, cursor: stopping ? 'not-allowed' : 'pointer' }}
        >
          Stop
        </button>
      </div>

      <SessionInput onSend={handleSendInput} disabled={!activeSession} />
    </div>
  )
}
