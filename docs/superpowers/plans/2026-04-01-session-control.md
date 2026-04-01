# Session Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session transparency, control, and recoverability to the dashboard.

**Architecture:** Session Manager enhancements (exit reason tracking, hang detection, enhanced WebSocket protocol) paired with new UI components (StatusBanner, SessionInput history, SessionHistoryPanel, SessionLogViewer) and API routes to expose session history. Session state is now explicit: the UI always explains WHY a session ended (completed, killed, error, rate limit).

**Tech Stack:** Next.js, WebSocket, Vitest, better-sqlite3, design system components from components/ui/

---

## Task 1: Database Schema — Add exit_reason Column

**Files:**
- Modify: `lib/db.ts`

**Summary:** Add `exit_reason` column to sessions table to track how sessions ended (completed, killed, error, or rate_limit).

- [ ] **Step 1: Add migration for exit_reason column**

In `lib/db.ts`, find the `initDb()` function and add this migration:

```typescript
// After the existing sessions table CREATE IF NOT EXISTS, add:
const migrations = [
  // ... existing migrations ...
  {
    id: 'add_exit_reason_column',
    up: `ALTER TABLE sessions ADD COLUMN exit_reason TEXT DEFAULT NULL;`,
    down: `ALTER TABLE sessions DROP COLUMN exit_reason;`
  }
]

// In initDb(), run migrations:
for (const migration of migrations) {
  const exists = db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(migration.id)
  if (!exists) {
    db.exec(migration.up)
    db.prepare(`INSERT INTO schema_migrations (id, applied_at) VALUES (?, datetime('now'))`).run(migration.id)
  }
}
```

Ensure the sessions table schema now includes:
```sql
exit_reason TEXT DEFAULT NULL
```

- [ ] **Step 2: Test the migration**

Run: `npm run test -- lib/db.test.ts` (create test file if needed)

Verify:
- Migration runs without error
- Column is present in schema
- NULL is the default value
- Old session records work unchanged

- [ ] **Commit**

```bash
git add lib/db.ts
git commit -m "feat: add exit_reason column to sessions table for tracking session end state"
```

---

## Task 2: Session Manager Enhancements — Exit Reason Detection & Hang Timer

**Files:**
- Modify: `lib/session-manager.ts`

**Summary:** Detect why sessions end (completed, killed, error, rate limit), store in DB, broadcast via WebSocket. Add hang detection timer (5 min silence → alert).

- [ ] **Step 1: Add exit reason detection in proc.on('close')**

In `spawnSession()`, after `const proc = spawn(...)`, find the `proc.on('close', ...)` handler and replace/enhance it:

```typescript
proc.on('close', (code, signal) => {
  let exitReason: string
  let exitMessage: string
  
  // Determine exit reason
  if (signal === 'SIGTERM' || signal === 'SIGKILL') {
    exitReason = 'killed'
    exitMessage = 'Session stopped by user'
  } else if (code === 0) {
    exitReason = 'completed'
    exitMessage = 'Session completed successfully'
  } else if (procStderr && procStderr.includes('rate limit')) {
    // Adapter-specific check (adapt regex to match your adapter patterns)
    exitReason = 'rate_limit'
    exitMessage = 'Rate limit exceeded — session ended'
  } else {
    exitReason = 'error'
    exitMessage = procStderr || `Process exited with code ${code}`
  }
  
  // Update DB with exit reason
  updateSession(db, sessionId, { state: 'ended', exit_reason: exitReason })
  
  // Broadcast status with details
  broadcast(sessionId, {
    type: 'status',
    state: 'ended',
    reason: exitReason,
    message: exitMessage,
  })
  
  // Clean up hang timer
  clearHangTimer(sessionId)
})
```

- [ ] **Step 2: Add spawn error handler**

Before `proc.on('close')`, add:

```typescript
proc.on('error', (err) => {
  updateSession(db, sessionId, { state: 'ended', exit_reason: 'error' })
  broadcast(sessionId, {
    type: 'status',
    state: 'ended',
    reason: 'error',
    message: err.message,
  })
  clearHangTimer(sessionId)
})
```

- [ ] **Step 3: Add hang detection timer**

At the top of `session-manager.ts`, add:

```typescript
const hangTimers = new Map<string, NodeJS.Timeout>()

function resetHangTimer(sessionId: string) {
  if (hangTimers.has(sessionId)) {
    clearTimeout(hangTimers.get(sessionId)!)
  }
  
  const timer = setTimeout(() => {
    broadcast(sessionId, {
      type: 'status',
      state: 'unresponsive',
      message: 'No output for 5 minutes — session may be stuck',
    })
  }, 5 * 60 * 1000)  // 5 minutes
  
  hangTimers.set(sessionId, timer)
}

function clearHangTimer(sessionId: string) {
  if (hangTimers.has(sessionId)) {
    clearTimeout(hangTimers.get(sessionId)!)
    hangTimers.delete(sessionId)
  }
}
```

- [ ] **Step 4: Reset hang timer on output**

In `proc.stdout.on('data', ...)` and `proc.stderr.on('data', ...)`, add a call to reset the timer:

```typescript
proc.stdout.on('data', (data) => {
  resetHangTimer(sessionId)  // Add this line
  broadcast(sessionId, { type: 'output', data: data.toString() })
  // ... rest of handler
})

proc.stderr.on('data', (data) => {
  resetHangTimer(sessionId)  // Add this line
  // ... existing handler logic
})
```

- [ ] **Step 5: Start hang timer when session spawns**

In `spawnSession()`, after `const proc = spawn(...)`, add:

```typescript
resetHangTimer(sessionId)  // Start 5-minute hang detection
```

- [ ] **Step 6: Test exit reason detection**

Create `lib/session-manager.test.ts` (if doesn't exist) with:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { spawnSession, broadcast } from './session-manager'

describe('Session Manager', () => {
  let db: Database.Database
  
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      state TEXT,
      exit_reason TEXT
    )`)
  })
  
  it('should detect completed sessions (exit code 0)', async () => {
    // Mock: spawn a process that exits with code 0
    // Verify exit_reason === 'completed' in DB
  })
  
  it('should detect killed sessions (SIGTERM)', async () => {
    // Mock: spawn and kill with SIGTERM
    // Verify exit_reason === 'killed' in DB
  })
  
  it('should detect error sessions (non-zero exit)', async () => {
    // Mock: spawn a process that exits with code 1
    // Verify exit_reason === 'error' in DB
  })
  
  it('should fire hang alert after 5 minutes of silence', async () => {
    // Mock: spawn, no output for 5 min
    // Verify broadcast called with state: 'unresponsive'
  })
  
  it('should reset hang timer on output', async () => {
    // Mock: output at 4:59 min mark
    // Verify hang timer doesn't fire
  })
})
```

Run: `npm run test -- lib/session-manager.test.ts`

- [ ] **Commit**

```bash
git add lib/session-manager.ts lib/session-manager.test.ts
git commit -m "feat: add exit reason detection, hang timer, and enhanced status messages"
```

---

## Task 3: WebSocket Protocol — Enhanced Status Messages

**Files:**
- Modify: `lib/session-manager.ts` (broadcast function)
- Modify: `lib/websocket-handler.ts` (or equivalent)

**Summary:** Update WebSocket message protocol to include state, reason, message, provider, and retryAfter fields. Maintain backward compatibility.

- [ ] **Step 1: Define WebSocket message types**

Create or update `lib/types/websocket.ts`:

```typescript
export type SessionStatusMessage = {
  type: 'status'
  state: 'active' | 'paused' | 'ended' | 'resumed' | 'unresponsive'
  reason?: 'completed' | 'killed' | 'error' | 'rate_limit'
  message?: string
  provider?: string  // for rate_limit
  retryAfter?: number  // seconds
}

export type SessionOutputMessage = {
  type: 'output'
  data: string
}

export type SessionEventMessage = {
  type: 'event'
  event: SessionEvent
}

export type SessionInputMessage = {
  type: 'input'
  data: string
}

export type SessionPauseMessage = {
  type: 'pause'
}

export type SessionResumeMessage = {
  type: 'resume'
}

export type SessionKillMessage = {
  type: 'kill'
}

export type WebSocketMessage =
  | SessionStatusMessage
  | SessionOutputMessage
  | SessionEventMessage
  | SessionInputMessage
  | SessionPauseMessage
  | SessionResumeMessage
  | SessionKillMessage
```

- [ ] **Step 2: Update session-manager broadcast calls**

Ensure all calls to `broadcast(sessionId, {...})` follow the new protocol:

- When session spawns: `{ type: 'status', state: 'active' }`
- On rate limit detected: `{ type: 'status', state: 'paused', reason: 'rate_limit', provider: 'claude', retryAfter: 45 }`
- On process close: `{ type: 'status', state: 'ended', reason: 'completed'|'killed'|'error'|'rate_limit', message: '...' }`
- On hang detected: `{ type: 'status', state: 'unresponsive', message: 'No output for 5 minutes...' }`

- [ ] **Step 3: Test backward compatibility**

Verify that clients ignoring new fields (old clients) still work:

```typescript
// Old client code should still receive output
{ type: 'output', data: '...' }
{ type: 'event', event: {...} }

// New messages don't break old clients if they filter by type
// (old clients just ignore type: 'status' if they don't have handlers)
```

- [ ] **Commit**

```bash
git add lib/types/websocket.ts lib/session-manager.ts
git commit -m "feat: enhance websocket protocol with detailed session status messages"
```

---

## Task 4: SessionStatusBanner Component — Status Display

**Files:**
- Create: `components/sessions/SessionStatusBanner.tsx`
- Create: `components/sessions/SessionStatusBanner.test.tsx`

**Summary:** Display session state (active, paused, ended, unresponsive) with icons, text, retry countdown, and kill button.

- [ ] **Step 1: Create SessionStatusBanner component**

Create `components/sessions/SessionStatusBanner.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type SessionStatusBannerProps = {
  state: 'active' | 'paused' | 'ended' | 'unresponsive'
  reason?: string  // 'completed' | 'killed' | 'error' | 'rate_limit'
  message?: string
  provider?: string
  retryAfter?: number
  onKill?: () => void
}

export function SessionStatusBanner({
  state,
  reason,
  message,
  provider,
  retryAfter,
  onKill,
}: SessionStatusBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState(retryAfter)

  useEffect(() => {
    if (!secondsLeft || secondsLeft <= 0) return
    
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev && prev > 0 ? prev - 1 : 0))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [secondsLeft])

  // Determine icon and colors based on state/reason
  const getStatusUI = () => {
    switch (state) {
      case 'active':
        return {
          icon: '●',
          color: 'text-green-500',
          bg: 'bg-green-500/10',
          text: 'Running session',
        }
      case 'paused':
        if (reason === 'rate_limit') {
          return {
            icon: '⚠',
            color: 'text-yellow-500',
            bg: 'bg-yellow-500/10',
            animate: 'animate-pulse',
            text: `Rate limited — ${provider}. Will resume in ${secondsLeft}s`,
          }
        }
        return {
          icon: '⏸',
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10',
          text: 'Paused by user',
          action: 'Resume',
        }
      case 'ended':
        if (reason === 'completed') {
          return {
            icon: '✓',
            color: 'text-gray-400',
            bg: 'bg-gray-500/10',
            text: 'Session completed successfully',
          }
        }
        if (reason === 'killed') {
          return {
            icon: '◻',
            color: 'text-gray-400',
            bg: 'bg-gray-500/10',
            text: 'Session stopped by user',
          }
        }
        if (reason === 'rate_limit') {
          return {
            icon: '✕',
            color: 'text-red-500',
            bg: 'bg-red-500/10',
            text: 'Rate limit exceeded — session ended',
          }
        }
        return {
          icon: '✕',
          color: 'text-red-500',
          bg: 'bg-red-500/10',
          text: `Error: ${message || 'Unknown error'}`,
        }
      case 'unresponsive':
        return {
          icon: '⚠',
          color: 'text-orange-500',
          bg: 'bg-orange-500/10',
          animate: 'animate-pulse',
          text: message || 'No output for 5 minutes — session may be stuck',
          action: 'Kill',
          actionOnClick: onKill,
        }
      default:
        return { icon: '?', color: 'text-gray-400', bg: 'bg-gray-500/10', text: 'Unknown state' }
    }
  }

  const ui = getStatusUI()

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-2 border-b',
      ui.bg,
      'border-gray-700 bg-gray-900/30',
      ui.animate,
    )}>
      <span className={cn('text-lg', ui.color)}>{ui.icon}</span>
      <span className="flex-1 text-sm text-gray-300">{ui.text}</span>
      {ui.action && (
        <button
          onClick={ui.actionOnClick}
          className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          {ui.action}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add styling to globals.css (if needed)**

Ensure dark palette tokens are in place (should already be from design system task):
- Background: `#0a0c0e`
- Border: `#1c1f22`
- Text: `#c8d0da`
- Action buttons: `#2563eb`

- [ ] **Step 3: Test all visual states**

Create `components/sessions/SessionStatusBanner.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionStatusBanner } from './SessionStatusBanner'

describe('SessionStatusBanner', () => {
  it('renders active state', () => {
    render(<SessionStatusBanner state="active" />)
    expect(screen.getByText('Running session')).toBeInTheDocument()
  })

  it('renders paused rate-limit with countdown', () => {
    render(<SessionStatusBanner state="paused" reason="rate_limit" provider="claude" retryAfter={45} />)
    expect(screen.getByText(/Rate limited.*Will resume in/)).toBeInTheDocument()
  })

  it('renders ended completed state', () => {
    render(<SessionStatusBanner state="ended" reason="completed" />)
    expect(screen.getByText('Session completed successfully')).toBeInTheDocument()
  })

  it('renders unresponsive state with kill button', () => {
    const onKill = () => {}
    render(<SessionStatusBanner state="unresponsive" onKill={onKill} />)
    expect(screen.getByText('Kill')).toBeInTheDocument()
  })
})
```

Run: `npm run test -- components/sessions/SessionStatusBanner.test.tsx`

- [ ] **Commit**

```bash
git add components/sessions/SessionStatusBanner.tsx components/sessions/SessionStatusBanner.test.tsx
git commit -m "feat: add SessionStatusBanner component with all visual states"
```

---

## Task 5: SessionInput Component — Arrow-Key History

**Files:**
- Modify: `components/sessions/SessionInput.tsx` (or create if doesn't exist)
- Create/Modify: `components/sessions/SessionInput.test.tsx`

**Summary:** Enhance SessionInput with arrow-up/down cycling through previous inputs. History stored in component state (not persisted).

- [ ] **Step 1: Enhance SessionInput with history state**

Update `components/sessions/SessionInput.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'

type SessionInputProps = {
  sessionId: string
  isActive: boolean
  disabled?: boolean
  onSubmit: (input: string) => void
}

const MAX_HISTORY = 50

export function SessionInput({
  sessionId,
  isActive,
  disabled,
  onSubmit,
}: SessionInputProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(history[newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInput('')
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    if (!input.trim()) return
    onSubmit(input)
    
    // Add to history (prepend, max 50)
    setHistory((prev) => [input, ...prev].slice(0, MAX_HISTORY))
    setHistoryIndex(-1)
    setInput('')
  }

  return (
    <div className="flex gap-2 p-4 border-t border-gray-700 bg-gray-900">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!isActive || disabled}
        placeholder={isActive ? 'Type command (↑↓ history, Shift+Enter newline)' : 'Session not active'}
        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={handleSubmit}
        disabled={!isActive || disabled}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm rounded font-medium transition"
      >
        Send
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Test history cycling**

Create/update `components/sessions/SessionInput.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionInput } from './SessionInput'

describe('SessionInput', () => {
  const mockOnSubmit = vitest.fn()

  it('submits on Enter key', async () => {
    render(<SessionInput sessionId="test" isActive={true} onSubmit={mockOnSubmit} />)
    const input = screen.getByPlaceholderText(/Type command/)
    
    await userEvent.type(input, 'echo hello')
    fireEvent.keyDown(input, { key: 'Enter' })
    
    expect(mockOnSubmit).toHaveBeenCalledWith('echo hello')
  })

  it('cycles backward through history with arrow-up', async () => {
    const { rerender } = render(<SessionInput sessionId="test" isActive={true} onSubmit={mockOnSubmit} />)
    const input = screen.getByPlaceholderText(/Type command/) as HTMLInputElement
    
    // Submit two commands
    await userEvent.type(input, 'cmd1')
    fireEvent.keyDown(input, { key: 'Enter' })
    
    await userEvent.type(input, 'cmd2')
    fireEvent.keyDown(input, { key: 'Enter' })
    
    // Arrow-up should show cmd2
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('cmd2')
    
    // Arrow-up again should show cmd1
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('cmd1')
  })

  it('cycles forward through history with arrow-down', async () => {
    render(<SessionInput sessionId="test" isActive={true} onSubmit={mockOnSubmit} />)
    const input = screen.getByPlaceholderText(/Type command/) as HTMLInputElement
    
    // After going up twice, down should go back
    await userEvent.type(input, 'cmd1')
    fireEvent.keyDown(input, { key: 'Enter' })
    
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('cmd1')
  })

  it('clears input when arrow-down from first history entry', async () => {
    render(<SessionInput sessionId="test" isActive={true} onSubmit={mockOnSubmit} />)
    const input = screen.getByPlaceholderText(/Type command/) as HTMLInputElement
    
    await userEvent.type(input, 'cmd1')
    fireEvent.keyDown(input, { key: 'Enter' })
    
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('cmd1')
    
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('')
  })

  it('enforces max 50 history entries', async () => {
    render(<SessionInput sessionId="test" isActive={true} onSubmit={mockOnSubmit} />)
    const input = screen.getByPlaceholderText(/Type command/) as HTMLInputElement
    
    // Submit 51 commands
    for (let i = 0; i < 51; i++) {
      await userEvent.type(input, `cmd${i}`)
      fireEvent.keyDown(input, { key: 'Enter' })
    }
    
    // Only last 50 should be in history (cmd1 through cmd50)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('cmd50')
  })
})
```

Run: `npm run test -- components/sessions/SessionInput.test.tsx`

- [ ] **Commit**

```bash
git add components/sessions/SessionInput.tsx components/sessions/SessionInput.test.tsx
git commit -m "feat: add input history cycling with arrow-up/down to SessionInput"
```

---

## Task 6: Session History API Routes — List Sessions & Fetch Logs

**Files:**
- Create: `app/api/tasks/[taskId]/sessions/route.ts`
- Create: `app/api/sessions/[sessionId]/log/route.ts`

**Summary:** Create API endpoints to list sessions for a task and fetch individual session NDJSON logs.

- [ ] **Step 1: Create /api/tasks/[taskId]/sessions route**

Create `app/api/tasks/[taskId]/sessions/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import Database from 'better-sqlite3'
import { getDb } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const db = getDb()
    
    // Query sessions for this task, ordered by created_at DESC
    const sessions = db.prepare(`
      SELECT id, task_id, provider_type, created_at, ended_at, exit_reason, session_log
      FROM sessions
      WHERE task_id = ?
      ORDER BY created_at DESC
    `).all(params.taskId) as Array<{
      id: string
      task_id: string
      provider_type: string
      created_at: string
      ended_at: string | null
      exit_reason: string | null
      session_log: string
    }>

    return NextResponse.json(sessions)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Create /api/sessions/[sessionId]/log route**

Create `app/api/sessions/[sessionId]/log/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { existsSync } from 'fs'
import Database from 'better-sqlite3'
import { getDb } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const db = getDb()
    
    // Get session_log path from DB
    const session = db.prepare(`
      SELECT session_log FROM sessions WHERE id = ?
    `).get(params.sessionId) as { session_log: string } | undefined

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }

    // Read and return NDJSON file
    if (!existsSync(session.session_log)) {
      return NextResponse.json(
        { error: 'Session log file not found' },
        { status: 404 }
      )
    }

    const content = readFileSync(session.session_log, 'utf-8')
    
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="${params.sessionId}.jsonl"`,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch session log' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 3: Test API routes**

Create test file `app/api/sessions/__tests__/api.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { GET as getTaskSessions } from '@/app/api/tasks/[taskId]/sessions/route'
import { GET as getSessionLog } from '@/app/api/sessions/[sessionId]/log/route'

describe('Session API Routes', () => {
  it('GET /api/tasks/[taskId]/sessions returns list of sessions', async () => {
    // Mock request/response
    const response = await getTaskSessions(
      new Request('http://localhost/api/tasks/task-1/sessions'),
      { params: { taskId: 'task-1' } }
    )
    
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET /api/sessions/[sessionId]/log returns NDJSON content', async () => {
    // Mock request/response
    const response = await getSessionLog(
      new Request('http://localhost/api/sessions/sess-1/log'),
      { params: { sessionId: 'sess-1' } }
    )
    
    expect(response.status).toBe(200 || 404)  // 404 if file doesn't exist
    if (response.status === 200) {
      const content = await response.text()
      expect(content).toMatch(/\{.*\}/m)  // Should contain JSON lines
    }
  })

  it('returns 404 for non-existent session', async () => {
    const response = await getSessionLog(
      new Request('http://localhost/api/sessions/nonexistent/log'),
      { params: { sessionId: 'nonexistent' } }
    )
    
    expect(response.status).toBe(404)
  })
})
```

Run: `npm run test -- app/api/sessions/__tests__/api.test.ts`

- [ ] **Commit**

```bash
git add app/api/tasks/[taskId]/sessions/route.ts app/api/sessions/[sessionId]/log/route.ts
git commit -m "feat: add api routes for session history listing and log retrieval"
```

---

## Task 7: SessionHistoryPanel & SessionLogViewer Components

**Files:**
- Create: `components/sessions/SessionHistoryPanel.tsx`
- Create: `components/sessions/SessionLogViewer.tsx`
- Create: `components/sessions/SessionHistoryPanel.test.tsx`

**Summary:** Display list of past sessions and allow viewing individual session logs with search.

- [ ] **Step 1: Create SessionHistoryPanel component**

Create `components/sessions/SessionHistoryPanel.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { SessionLogViewer } from './SessionLogViewer'

type SessionRecord = {
  id: string
  task_id: string
  provider_type: string
  created_at: string
  ended_at: string | null
  exit_reason: string | null
  session_log: string
}

type SessionHistoryPanelProps = {
  taskId: string
}

export function SessionHistoryPanel({ taskId }: SessionHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch(`/api/tasks/${taskId}/sessions`)
        if (!response.ok) throw new Error('Failed to fetch sessions')
        const data = await response.json()
        setSessions(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchSessions()
  }, [taskId])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const getStatusBadge = (exitReason: string | null) => {
    const map: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      killed: 'bg-gray-500/20 text-gray-400',
      error: 'bg-red-500/20 text-red-400',
      rate_limit: 'bg-yellow-500/20 text-yellow-400',
    }
    return map[exitReason || 'active'] || 'bg-blue-500/20 text-blue-400'
  }

  if (loading) return <div className="p-4 text-gray-400">Loading sessions...</div>
  if (error) return <div className="p-4 text-red-400">Error: {error}</div>

  return (
    <div className="border-t border-gray-700">
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Session History</h3>
        
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions yet</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setSelectedSessionId(session.id)}
                className="flex items-center gap-3 p-3 bg-gray-800 border border-gray-700 rounded cursor-pointer hover:bg-gray-750 transition"
              >
                <div className="flex-1">
                  <div className="text-sm text-gray-200">{session.provider_type}</div>
                  <div className="text-xs text-gray-400">{formatDate(session.created_at)}</div>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${getStatusBadge(session.exit_reason)}`}>
                  {session.exit_reason || 'active'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedSessionId && (
        <SessionLogViewer sessionId={selectedSessionId} onClose={() => setSelectedSessionId(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create SessionLogViewer component**

Create `components/sessions/SessionLogViewer.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'

type SessionLogEntry = {
  type: string
  created_at?: string
  content?: string
  metadata?: Record<string, any>
  [key: string]: any
}

type SessionLogViewerProps = {
  sessionId: string
  onClose?: () => void
}

export function SessionLogViewer({ sessionId, onClose }: SessionLogViewerProps) {
  const [log, setLog] = useState<SessionLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLog = async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/log`)
        if (!response.ok) throw new Error('Failed to fetch log')
        
        const text = await response.text()
        const lines = text.trim().split('\n')
        const entries = lines
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
        
        setLog(entries)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchLog()
  }, [sessionId])

  const filtered = log.filter((entry) =>
    JSON.stringify(entry).toLowerCase().includes(search.toLowerCase())
  )

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleTimeString()
  }

  if (loading) return <div className="p-4 text-gray-400">Loading log...</div>
  if (error) return <div className="p-4 text-red-400">Error: {error}</div>

  return (
    <div className="border-t border-gray-700 p-4 bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-semibold text-gray-100">Session Log</h4>
        {onClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-200">✕</button>}
      </div>

      <input
        type="text"
        placeholder="Search log..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="text-gray-500">No matching entries</div>
        ) : (
          filtered.map((entry, i) => (
            <LogEntry key={i} entry={entry} formatTime={formatTime} />
          ))
        )}
      </div>
    </div>
  )
}

function LogEntry({
  entry,
  formatTime,
}: {
  entry: SessionLogEntry
  formatTime: (date: string | undefined) => string
}) {
  const { type, created_at, content, metadata } = entry

  return (
    <div className="text-gray-400 p-1 hover:bg-gray-800 rounded">
      <span className="text-gray-500">[{formatTime(created_at)}]</span>
      {' '}
      <span className="text-blue-400">{type}</span>
      {' '}
      {content && <span className="text-gray-300">{content}</span>}
      {metadata && <span className="text-gray-600">{JSON.stringify(metadata)}</span>}
    </div>
  )
}
```

- [ ] **Step 3: Test history panel and log viewer**

Create `components/sessions/SessionHistoryPanel.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionHistoryPanel } from './SessionHistoryPanel'

// Mock fetch
global.fetch = vi.fn()

describe('SessionHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and displays sessions list', async () => {
    const mockSessions = [
      {
        id: 'sess-1',
        task_id: 'task-1',
        provider_type: 'claude',
        created_at: '2026-04-01T10:00:00Z',
        ended_at: '2026-04-01T10:05:00Z',
        exit_reason: 'completed',
        session_log: '/path/to/log',
      },
    ]

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockSessions,
    })

    render(<SessionHistoryPanel taskId="task-1" />)

    await waitFor(() => {
      expect(screen.getByText('claude')).toBeInTheDocument()
    })
  })

  it('displays loading state initially', () => {
    ;(global.fetch as any).mockImplementationOnce(
      () =>
        new Promise(() => {
          /* never resolve */
        })
    )

    render(<SessionHistoryPanel taskId="task-1" />)

    expect(screen.getByText(/Loading sessions/i)).toBeInTheDocument()
  })

  it('displays error state on fetch failure', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    render(<SessionHistoryPanel taskId="task-1" />)

    await waitFor(() => {
      expect(screen.getByText(/Error/i)).toBeInTheDocument()
    })
  })
})
```

Run: `npm run test -- components/sessions/SessionHistoryPanel.test.tsx`

- [ ] **Commit**

```bash
git add components/sessions/SessionHistoryPanel.tsx components/sessions/SessionLogViewer.tsx components/sessions/SessionHistoryPanel.test.tsx
git commit -m "feat: add session history and log viewer components"
```

---

## Task 8: Integration — Wire SessionStatusBanner & SessionHistoryPanel into Existing Components

**Files:**
- Modify: `components/sessions/FloatingSessionWindow.tsx`
- Modify: `components/tasks/LiveRunsSection.tsx`
- Modify: `app/(dashboard)/tasks/[taskId]/page.tsx` (if needed)

**Summary:** Place SessionStatusBanner above terminal output in FloatingSessionWindow and LiveRunsSection. Add SessionHistoryPanel below terminal output in LiveRunsSection.

- [ ] **Step 1: Update FloatingSessionWindow**

In `components/sessions/FloatingSessionWindow.tsx`, find the render section and add SessionStatusBanner:

```typescript
import { SessionStatusBanner } from './SessionStatusBanner'

export function FloatingSessionWindow({ sessionId, ...props }: FloatingSessionWindowProps) {
  const [status, setStatus] = useState<{ state: string; reason?: string; message?: string }>({ state: 'active' })

  // In WebSocket message handler:
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'status') {
        setStatus(msg)
      }
      // ... rest of handler
    }
  }, [])

  return (
    <div className="...">
      <SessionStatusBanner
        state={status.state as any}
        reason={status.reason}
        message={status.message}
        provider={status.provider}
        retryAfter={status.retryAfter}
        onKill={() => {
          // Send kill message to WebSocket
          ws.send(JSON.stringify({ type: 'kill' }))
        }}
      />
      {/* Terminal output below */}
      <div ref={terminalRef} className="..."></div>
    </div>
  )
}
```

- [ ] **Step 2: Update LiveRunsSection**

In `components/tasks/LiveRunsSection.tsx`, add banner and history panel:

```typescript
import { SessionStatusBanner } from '@/components/sessions/SessionStatusBanner'
import { SessionHistoryPanel } from '@/components/sessions/SessionHistoryPanel'

export function LiveRunsSection({ taskId, ...props }: LiveRunsSectionProps) {
  // ... existing logic

  return (
    <div className="...">
      <h3>Live Runs</h3>
      
      {activeSession && (
        <div>
          <SessionStatusBanner
            state={activeSession.state as any}
            reason={activeSession.reason}
            message={activeSession.message}
            onKill={handleKillSession}
          />
          {/* Terminal output */}
          <div className="..."></div>
        </div>
      )}

      {/* Session history below terminal */}
      <SessionHistoryPanel taskId={taskId} />
    </div>
  )
}
```

- [ ] **Step 3: Test integration**

Manually test in browser:
1. Start a session → should see SessionStatusBanner at top
2. Banner should show "Running session" in green
3. If rate limit occurs → banner updates to orange "Rate limited..." with countdown
4. When session ends → banner shows checkmark or error
5. Scroll down → see SessionHistoryPanel with list of past sessions
6. Click a session → log viewer opens with NDJSON entries

Create integration test:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FloatingSessionWindow } from './FloatingSessionWindow'

describe('FloatingSessionWindow Integration', () => {
  it('renders SessionStatusBanner above terminal', () => {
    render(<FloatingSessionWindow sessionId="sess-1" isOpen={true} />)
    expect(screen.getByText('Running session')).toBeInTheDocument()
  })

  it('updates banner when session state changes', async () => {
    const { rerender } = render(<FloatingSessionWindow sessionId="sess-1" isOpen={true} />)
    // Simulate WebSocket message
    // rerender with new status
    // expect(screen.getByText(/Session completed/)).toBeInTheDocument()
  })
})
```

- [ ] **Commit**

```bash
git add components/sessions/FloatingSessionWindow.tsx components/tasks/LiveRunsSection.tsx
git commit -m "feat: integrate SessionStatusBanner and SessionHistoryPanel into session views"
```

---

## Task 9: End-to-End Testing — Session Lifecycle

**Files:**
- Create: `tests/e2e/session-control.e2e.ts` (or use Playwright/Cypress)

**Summary:** Test full session lifecycle: spawn → active → end with reason → history visibility.

- [ ] **Step 1: Write E2E test for session lifecycle**

Create `tests/e2e/session-control.e2e.ts` (adjust based on your E2E framework):

```typescript
import { describe, it, expect } from 'vitest'

describe('Session Control E2E', () => {
  it('user can spawn session and see status banner', async () => {
    // 1. Navigate to task detail page
    // 2. Click "Run Session"
    // 3. Verify SessionStatusBanner appears with "Running session"
    // 4. Verify terminal output appears
  })

  it('user can see session ended with reason in banner', async () => {
    // 1. Spawn a session that completes quickly
    // 2. Wait for process to exit
    // 3. Verify SessionStatusBanner shows "Session completed successfully"
    // 4. Verify exit_reason is stored in DB
  })

  it('user can view session history', async () => {
    // 1. Spawn and complete a session
    // 2. Scroll down to SessionHistoryPanel
    // 3. Verify past session appears in list with timestamp
    // 4. Click to view log
    // 5. Verify NDJSON entries are displayed
  })

  it('hang detection alerts after 5 minutes of silence', async () => {
    // 1. Spawn a session that produces no output
    // 2. Wait > 5 minutes (or mock time)
    // 3. Verify SessionStatusBanner shows "No output for 5 minutes"
    // 4. Verify Kill button appears
    // 5. Click Kill → verify process terminates
  })

  it('rate limit pauses session and shows countdown', async () => {
    // 1. Spawn session that triggers rate limit
    // 2. Verify SessionStatusBanner shows "Rate limited — claude. Will resume in 45s"
    // 3. Verify countdown decrements
    // 4. Verify session auto-resumes after countdown
  })

  it('input history works with arrow keys', async () => {
    // 1. Spawn session
    // 2. Type and submit "echo 1"
    // 3. Type and submit "echo 2"
    // 4. Press arrow-up → input field shows "echo 2"
    // 5. Press arrow-up → input field shows "echo 1"
    // 6. Press arrow-down → input field shows "echo 2"
    // 7. Press arrow-down → input field is empty
  })
})
```

- [ ] **Step 2: Run E2E tests**

Run: `npm run test:e2e` (or equivalent for your E2E framework)

- [ ] **Commit**

```bash
git add tests/e2e/session-control.e2e.ts
git commit -m "test: add end-to-end tests for session control features"
```

---

## Task 10: Documentation & Cleanup

**Files:**
- Modify: `docs/features/session-control.md` (create if doesn't exist)

**Summary:** Document the session control feature for users and developers.

- [ ] **Step 1: Write user-facing documentation**

Create `docs/features/session-control.md`:

```markdown
# Session Control

## Overview

Session Control provides transparency, control, and recoverability for AI coding sessions.

### Features

- **Session Status Banner**: Always see why a session is running, paused, or ended
- **Input History**: Use arrow-up/down to cycle through previous commands
- **Session History**: View logs from all past sessions
- **Hang Detection**: Alerts if a session has produced no output for 5 minutes
- **Clear Exit Reasons**: Know exactly why a session ended (completed, error, rate limit, or user action)

## Status States

| State | Meaning |
|-------|---------|
| **Running** | Session is active and responding |
| **Paused (Rate Limit)** | Session hit a rate limit; will auto-resume |
| **Paused (User)** | User paused the session; click Resume to restart |
| **Completed** | Session ended successfully |
| **Error** | Session ended with an error (see message for details) |
| **Unresponsive** | No output for 5 minutes; may be stuck |

## Input History

In the session input field:
- **Arrow-Up**: Cycle backward through previous commands
- **Arrow-Down**: Cycle forward
- **Shift+Enter**: Insert newline

History is stored per-session and lost when the session closes.

## Session History

At the bottom of the task detail page, see all past sessions:
- Click a session to view its NDJSON log
- Search the log for specific entries
- Filter by provider, status, or date

## Hang Detection

If a session produces no output for 5 minutes, the status banner will alert you. You can:
- Wait for the session to respond (hang alert will clear)
- Click **Kill** to terminate the session

---

## Developer Notes

See [Session Control Design Spec](../../superpowers/specs/2026-04-01-session-control-design.md) for architecture details.

### API Endpoints

- `GET /api/tasks/{taskId}/sessions` — List all sessions for a task
- `GET /api/sessions/{sessionId}/log` — Fetch NDJSON log for a session

### WebSocket Messages

The session WebSocket now sends enhanced status messages:

```json
{ "type": "status", "state": "active" }
{ "type": "status", "state": "paused", "reason": "rate_limit", "provider": "claude", "retryAfter": 45 }
{ "type": "status", "state": "ended", "reason": "completed", "message": "Session completed successfully" }
```

See [Session Control Design Spec](../../superpowers/specs/2026-04-01-session-control-design.md) § 2 for full protocol documentation.
```

- [ ] **Step 2: Verify all files are in place**

Check:
- [ ] `lib/db.ts` — exit_reason column added
- [ ] `lib/session-manager.ts` — exit reason detection, hang timer, enhanced broadcast
- [ ] `lib/types/websocket.ts` — WebSocket message types
- [ ] `components/sessions/SessionStatusBanner.tsx` — Status display component
- [ ] `components/sessions/SessionInput.tsx` — Input history functionality
- [ ] `components/sessions/SessionHistoryPanel.tsx` — History list and log viewer
- [ ] `components/sessions/SessionLogViewer.tsx` — Log search and display
- [ ] `app/api/tasks/[taskId]/sessions/route.ts` — Session list API
- [ ] `app/api/sessions/[sessionId]/log/route.ts` — Session log API
- [ ] `components/sessions/FloatingSessionWindow.tsx` — Integrated SessionStatusBanner
- [ ] `components/tasks/LiveRunsSection.tsx` — Integrated SessionStatusBanner & SessionHistoryPanel
- [ ] All test files created and passing

- [ ] **Step 3: Run full test suite**

Run: `npm run test`

Verify all tests pass, coverage remains healthy.

- [ ] **Commit**

```bash
git add docs/features/session-control.md
git commit -m "docs: add session control user and developer documentation"
```

---

## Summary Checklist

- [ ] Task 1: Database schema (exit_reason column)
- [ ] Task 2: Session Manager (exit detection, hang timer)
- [ ] Task 3: WebSocket protocol (enhanced status messages)
- [ ] Task 4: SessionStatusBanner component
- [ ] Task 5: SessionInput history
- [ ] Task 6: Session History API routes
- [ ] Task 7: SessionHistoryPanel & SessionLogViewer
- [ ] Task 8: Integration (FloatingSessionWindow, LiveRunsSection)
- [ ] Task 9: E2E tests
- [ ] Task 10: Documentation

**Total tasks:** 10
**Est. effort:** 2-3 days (24-32 hours) for full implementation
**Key dependencies:** None — can be worked in parallel or sequentially
