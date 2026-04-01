# Session Control — Design Spec

**Goal:** Improve visibility and control of AI coding sessions. Surface error reasons, add pause/resume, show session history, detect hangs, and provide input history.

**Principles:**
- Errors are explained to users — spawn failures, rate limits, and crashes surface clear, actionable reasons
- Sessions are pauseable — rate limits and user-initiated pauses are resumeable without killing the process
- History is discoverable — past session logs are browsable and queryable
- Feedback is responsive — users are alerted when sessions hang or become unresponsive
- Session state is explicit — the UI always explains WHY a session ended (completed, error, rate limit, user action)

---

## 1. Session Status Banner

A persistent banner at the top of the session view (both `FloatingSessionWindow` and `LiveRunsSection`) that displays the session's current state and reason.

### Component: `SessionStatusBanner`

Located: `components/sessions/SessionStatusBanner.tsx`

```typescript
type SessionStatusBannerProps = {
  status: SessionStatus  // 'active' | 'paused' | 'ended' | 'unresponsive'
  reason?: string        // exit reason or error message
  provider?: string      // for rate limit — which provider
  retryAfter?: number    // seconds until rate limit expires (if known)
}

export function SessionStatusBanner(props: SessionStatusBannerProps) {
  // renders status badge, reason text, and retry timer (if applicable)
}
```

### Visual states

| State | Appearance | Text | Action |
|-------|-----------|------|--------|
| **Active** | green dot, solid | "Running session" | none |
| **Paused (rate limit)** | orange warning, pulsing | "Rate limited — {provider}. Will resume in {retryAfter}s" | none (auto-resumes) |
| **Paused (user)** | yellow pause icon | "Paused by user" | Resume button |
| **Ended: Completed** | gray checkmark | "Session completed successfully" | none |
| **Ended: Killed** | gray square-stop | "Session stopped by user" | none |
| **Ended: Error** | red X | "Error: {message}" | none |
| **Ended: Rate limit (no recovery)** | red warning | "Rate limit exceeded — session ended" | none |
| **Unresponsive** | orange warning, pulsing | "No output for 5 minutes — session may be stuck" | Kill button |

### Placement

1. **FloatingSessionWindow** — banner sits above the xterm terminal, inside the window
2. **LiveRunsSection** (task detail) — banner sits above the terminal output area
3. Both receive the same props from the session state broadcast via WebSocket

### Implementation notes

- Uses the existing dark palette: `#0a0c0e` background, `#1c1f22` border, `#c8d0da` text, `#2563eb` action buttons
- Compact height (~32–40px) to avoid obscuring output
- Reason text is clickable → expands to show full error details (if > 100 chars)
- Retry timer (if present) counts down in real-time with `setInterval`

---

## 2. Enhanced WebSocket Protocol

Extend WebSocket messages to carry richer session state information. Backward-compatible: clients that ignore new fields work unchanged.

### Server → Client messages

#### New/modified: `status` message

```typescript
{
  type: 'status',
  state: 'active' | 'paused' | 'ended' | 'resumed' | 'unresponsive',
  reason?: 'completed' | 'killed' | 'error' | 'rate_limit',
  message?: string,                  // exit reason or error detail
  provider?: string,                 // for rate_limit state
  retryAfter?: number,               // seconds until rate limit expires
}
```

**Examples:**

```json
{ "type": "status", "state": "active" }

{ "type": "status", "state": "paused", "reason": "rate_limit", "provider": "claude", "retryAfter": 45 }

{ "type": "status", "state": "ended", "reason": "completed", "message": "Session completed successfully" }

{ "type": "status", "state": "ended", "reason": "error", "message": "spawn ENOENT: claude command not found" }

{ "type": "status", "state": "unresponsive", "message": "No output for 5 minutes" }

{ "type": "status", "state": "resumed" }
```

#### Existing messages (unchanged)

- `{ type: 'output', data: string }` — raw terminal output
- `{ type: 'event', event: SessionEvent }` — structured event

### Client → Server messages

- `{ type: 'input', data: string }` — send to session stdin
- `{ type: 'pause' }` — pause the session (new)
- `{ type: 'resume' }` — resume a paused session (new)
- `{ type: 'kill' }` — kill the session (existing, no change)

### Backward compatibility

Old clients that emit the legacy `{ type: 'rate_limit', provider: string }` message will be ignored (server accepts but doesn't process). New clients use the unified `status` message with `state: 'paused'`.

---

## 3. Session End Reasons

Track WHY a session ended. Add `exit_reason` column to `sessions` table to record completion status, user action, error, or rate limit.

### Database schema change

```sql
ALTER TABLE sessions ADD COLUMN exit_reason TEXT DEFAULT NULL;
-- Values: 'completed' | 'killed' | 'error' | 'rate_limit'
```

### Detection logic

#### In `session-manager.ts` — `spawnSession()`

```typescript
const proc = spawn(provider.command, args, { stdio: ['pipe', 'pipe', 'pipe'] })

proc.on('close', (code, signal) => {
  let exitReason: string
  
  if (signal === 'SIGTERM' || signal === 'SIGKILL') {
    exitReason = 'killed'  // user clicked Stop or pause→terminate
  } else if (code === 0) {
    exitReason = 'completed'  // normal exit
  } else if (hasRateLimitError) {
    exitReason = 'rate_limit'  // adapter detected rate limit in stderr
  } else {
    exitReason = 'error'  // non-zero exit code
  }
  
  // Update DB
  updateSession(db, sessionId, { state: 'ended', exit_reason: exitReason })
  
  // Broadcast to clients
  broadcast(sessionId, {
    type: 'status',
    state: 'ended',
    reason: exitReason,
    message: getReasonMessage(exitReason, procStderr),
  })
})
```

#### Spawn error handling

```typescript
proc.on('error', (err) => {
  updateSession(db, sessionId, { state: 'ended', exit_reason: 'error' })
  broadcast(sessionId, {
    type: 'status',
    state: 'ended',
    reason: 'error',
    message: err.message,
  })
})
```

### Rate limit detection (unchanged from current)

Adapter-specific regex patterns detect rate limit errors in stderr. On detection:
1. Set session status to `'paused'` in DB
2. Broadcast `{ type: 'status', state: 'paused', reason: 'rate_limit', provider, retryAfter }`
3. Do NOT kill the process (it remains suspended)
4. If auto-resume is triggered (e.g., 60-second timeout), broadcast `{ type: 'status', state: 'resumed' }`

On process close while paused with rate limit, `exit_reason = 'rate_limit'`.

---

## 4. Input History

In `SessionInput.tsx`, add arrow-up/down cycling through previous inputs. History is per-session and stored in component state (not persisted to DB).

### Component: `SessionInput` (enhanced)

Located: `components/sessions/SessionInput.tsx`

```typescript
type SessionInputProps = {
  sessionId: string
  isActive: boolean
  disabled?: boolean
  onSubmit: (input: string) => void
}

export function SessionInput(props: SessionInputProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])  // per-session
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
    props.onSubmit(input)
    setHistory([input, ...history])  // prepend
    setHistoryIndex(-1)
    setInput('')
  }
  
  return (
    <div className="session-input">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!props.isActive || props.disabled}
        placeholder={props.isActive ? 'Type command (Shift+Enter for newline)' : 'Session not active'}
      />
      <button onClick={handleSubmit} disabled={!props.isActive || props.disabled}>
        Send
      </button>
    </div>
  )
}
```

### Behavior

- **Arrow-up:** Cycle backward through history (most recent first)
- **Arrow-down:** Cycle forward through history (toward empty input)
- **Enter:** Submit input (same as button click)
- **Shift+Enter:** Insert newline in input field
- History is lost when the session component unmounts (not persisted across page refreshes)
- Max 50 entries per session (FIFO eviction if history grows)

### Styling

Follows dark palette: input background `#1c1f22`, text `#c8d0da`, send button `#2563eb` hover.

---

## 5. Session History Viewer

A new component and API to browse past session logs from the task detail page. Shows list of all sessions for a task, with the ability to view individual session logs.

### Component: `SessionHistoryPanel`

Located: `components/sessions/SessionHistoryPanel.tsx`

Accessible from task detail view:
- Tab or collapsible section at the bottom of the task detail page labeled "Session History"
- Shows a list of past sessions (from `sessions` table, ordered newest first)

```typescript
type SessionHistoryPanelProps = {
  taskId: string
}

export function SessionHistoryPanel(props: SessionHistoryPanelProps) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  
  // On mount, fetch all sessions for this task
  useEffect(() => {
    fetch(`/api/tasks/${props.taskId}/sessions`)
      .then(r => r.json())
      .then(setSessions)
  }, [props.taskId])
  
  return (
    <div className="session-history-panel">
      <h3>Session History</h3>
      <ul>
        {sessions.map(session => (
          <li key={session.id} onClick={() => setSelectedSessionId(session.id)}>
            <span className="timestamp">{formatDate(session.created_at)}</span>
            <span className="provider">{session.provider_type}</span>
            <span className="status">{session.exit_reason || 'active'}</span>
          </li>
        ))}
      </ul>
      
      {selectedSessionId && (
        <SessionLogViewer sessionId={selectedSessionId} />
      )}
    </div>
  )
}
```

### Component: `SessionLogViewer`

Located: `components/sessions/SessionLogViewer.tsx`

Displays the NDJSON session log file as a scrollable, searchable log viewer.

```typescript
type SessionLogViewerProps = {
  sessionId: string
}

export function SessionLogViewer(props: SessionLogViewerProps) {
  const [log, setLog] = useState<SessionLogEntry[]>([])
  const [search, setSearch] = useState('')
  
  // Fetch the NDJSON log file
  useEffect(() => {
    fetch(`/api/sessions/${props.sessionId}/log`)
      .then(r => r.text())
      .then(text => {
        const lines = text.trim().split('\n')
        const entries = lines.map(line => JSON.parse(line))
        setLog(entries)
      })
  }, [props.sessionId])
  
  const filtered = log.filter(entry =>
    JSON.stringify(entry).toLowerCase().includes(search.toLowerCase())
  )
  
  return (
    <div className="session-log-viewer">
      <input
        type="text"
        placeholder="Search log..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="log-entries">
        {filtered.map((entry, i) => (
          <LogEntry key={i} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function LogEntry(props: { entry: SessionLogEntry }) {
  const { type, created_at, content, metadata } = props.entry
  return (
    <div className="log-entry">
      <span className="timestamp">{formatTime(created_at)}</span>
      <span className="type">{type}</span>
      <span className="content">{content || JSON.stringify(metadata)}</span>
    </div>
  )
}
```

### API routes

#### `GET /api/tasks/[taskId]/sessions`

Returns a list of all sessions for a task.

```json
[
  {
    "id": "sess-abc123",
    "task_id": "task-def456",
    "provider_type": "claude",
    "created_at": "2026-04-01T14:30:00Z",
    "ended_at": "2026-04-01T14:35:42Z",
    "exit_reason": "completed",
    "session_log": "/home/user/project-control/data/sessions/sess-abc123.jsonl"
  },
  ...
]
```

#### `GET /api/sessions/[sessionId]/log`

Returns the raw NDJSON session log file.

```
{"type":"init","metadata":{"sessionId":"sess-abc123","model":"claude-3-5-sonnet","provider":"claude"},"created_at":"2026-04-01T14:30:00Z"}
{"type":"message","role":"assistant","content":"I'll start by...","created_at":"2026-04-01T14:30:05Z"}
{"type":"tokens","metadata":{"input":120,"output":45,"cached":0,"costUsd":0.00245},"created_at":"2026-04-01T14:35:40Z"}
```

---

## 6. Hang Detection

Monitor sessions that haven't produced output for > 5 minutes. Alert the user without auto-killing the process.

### Implementation: `session-manager.ts`

Add a timer map alongside `procMap`:

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

// On stdout/stderr output
proc.stdout.on('data', (data) => {
  resetHangTimer(sessionId)  // reset the timer
  broadcast(sessionId, { type: 'output', data: data.toString() })
})

// On session end
proc.on('close', () => {
  hangTimers.delete(sessionId)  // clean up
  // ... rest of close handler
})
```

### Behavior

1. When a session spawns, start a 5-minute hang timer
2. Every time output is received, reset the timer
3. If the timer fires (no output for 5 minutes), broadcast `{ type: 'status', state: 'unresponsive' }`
4. `SessionStatusBanner` displays the warning
5. User can manually kill the session with the Kill button, or wait for output to resume (which cancels the warning)

---

## 7. Pause and Resume (Future)

Placeholder for manual pause/resume functionality. The infrastructure (paused status, resume messages) is in place but the UI and control logic are deferred.

### WebSocket messages (defined above, not yet implemented)

- `{ type: 'pause' }` — pause the session
- `{ type: 'resume' }` — resume a paused session

### Future session-manager handler

```typescript
// Pause: send SIGSTOP to the process (does not kill stdin/stdout)
// Resume: send SIGCONT to resume

handleWebSocket(ws, message) {
  if (message.type === 'pause') {
    proc.kill('SIGSTOP')
    updateSession(db, sessionId, { status: 'paused', paused_reason: 'user' })
    broadcast(sessionId, { type: 'status', state: 'paused', reason: 'user' })
  }
  if (message.type === 'resume') {
    proc.kill('SIGCONT')
    updateSession(db, sessionId, { status: 'active' })
    broadcast(sessionId, { type: 'status', state: 'resumed' })
  }
}
```

---

## 8. File Structure

### Created

| File | Responsibility |
|------|----------------|
| `components/sessions/SessionStatusBanner.tsx` | Status badge, reason text, retry timer |
| `components/sessions/SessionInput.tsx` | Input field with arrow-key history cycling |
| `components/sessions/SessionHistoryPanel.tsx` | List of past sessions for a task |
| `components/sessions/SessionLogViewer.tsx` | Searchable NDJSON log viewer |
| `app/api/tasks/[taskId]/sessions/route.ts` | GET: list sessions for a task |
| `app/api/sessions/[sessionId]/log/route.ts` | GET: fetch NDJSON session log file |

### Modified

| File | Change |
|------|--------|
| `lib/db.ts` | Add `exit_reason` column to sessions table |
| `lib/session-manager.ts` | Detect exit reason, broadcast enhanced status messages, implement hang timer, store exit reason in DB |
| `components/sessions/FloatingSessionWindow.tsx` | Add `SessionStatusBanner` at top, remove manual status text |
| `components/tasks/LiveRunsSection.tsx` | Add `SessionStatusBanner` above terminal output, add `SessionHistoryPanel` below |
| `app/(dashboard)/tasks/[taskId]/page.tsx` | Ensure SessionStatusBanner and SessionHistoryPanel are rendered in task detail |

---

## 9. Data Flow

### Session Spawning and Status

```
User launches session on task
  → spawnSession(opts) in session-manager.ts
    → spawn(command, args)
    → create session record in DB with status='active'
    → broadcast { type: 'status', state: 'active' }
    → start hang timer (5 min, reset on output)

On stdout/stderr output
  → reset hang timer
  → check adapter regex for rate limit
    → if detected: set status='paused', broadcast { type: 'status', state: 'paused', reason: 'rate_limit', provider, retryAfter }
  → broadcast { type: 'output', data }

On process close (exit code, signal, or timeout)
  → determine exit_reason: 'completed' | 'killed' | 'error' | 'rate_limit'
  → set status='ended', store exit_reason in DB
  → flush session_events to NDJSON file
  → broadcast { type: 'status', state: 'ended', reason, message }
  → clear hang timer
```

### UI Rendering

```
FloatingSessionWindow/LiveRunsSection
  ← subscribe to session WebSocket
    ← receive { type: 'status', state, reason, message, ... }
    → pass to SessionStatusBanner
      → render status badge + reason text + timer (if rate_limit)
    ← receive { type: 'output', data }
    → append to xterm/log view
    ← receive { type: 'status', state: 'unresponsive' }
    → SessionStatusBanner shows warning + Kill button

User types in SessionInput
  → press arrow-up
    → component cycles through history
  → press Enter
    → send { type: 'input', data } over WebSocket
    → prepend to history array in component state
```

### Session History

```
Task detail page loads
  → fetch GET /api/tasks/{taskId}/sessions
    → returns list of SessionRecord[] with exit_reason, session_log path
  → render SessionHistoryPanel with list
    → user clicks a session
    → fetch GET /api/sessions/{sessionId}/log
    → parse NDJSON, render in SessionLogViewer
      → user can search/filter entries
```

---

## 10. Testing

- **SessionStatusBanner:** Render states (active, paused, ended, unresponsive) with correct icons/colors/text
- **SessionInput:** Arrow-key history cycling, max 50 entries, Shift+Enter newline, history reset on new session
- **SessionHistoryPanel:** Fetch sessions list, render list with timestamps and status, click to view log
- **SessionLogViewer:** Parse NDJSON, render entries, search functionality
- **Hang timer:** Reset on output, fire after 5 min of silence, clear on session end
- **Exit reason detection:** Distinguish completed (code 0), killed (SIGTERM/SIGKILL), error (non-zero), rate_limit
- **WebSocket protocol:** Backward compatible with old clients, new messages carry full context
- **API routes:** `/api/tasks/{taskId}/sessions` returns list, `/api/sessions/{sessionId}/log` returns NDJSON file
