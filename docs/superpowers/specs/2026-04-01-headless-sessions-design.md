# Headless-First Session Architecture

## Overview

Replace the current PTY-based session spawning with pipe-based headless sessions. All CLI providers (Claude, Gemini, Codex, Ollama) are invoked via `child_process.spawn` with structured NDJSON output. A per-provider adapter layer handles argument construction and output parsing. Structured events are stored in a `session_events` table during the session, flushed to a log file on end, and referenced on the task record. The task detail page gains an input bar below the terminal output for sending data to the session's stdin.

## Goals

- Unified structured data extraction across all providers (tokens, tool calls, cost, errors)
- Remove `node-pty` dependency
- Session events queryable in DB while active, archived to disk on end
- User can send input to any running session via a GUI input bar on the task page

## Architecture

```
CLI (pipe spawn) → stdout → Line Parser → session_events table → WebSocket → Task Page
                                        → { type: 'output' }   → WebSocket → Terminal View
                 ← stdin  ←──────────────────────────────────── WebSocket ← Input Bar
```

All sessions are pipe-based. No PTY. The terminal output section on the task page renders raw stdout. The adapter parsers extract structured events behind the scenes for persistence and analytics.

---

## 1. Adapter Layer

### File structure

```
lib/sessions/
  adapters/
    types.ts       — TranscriptEvent, AdapterConfig, AdapterModule
    claude.ts      — buildClaudeArgs(), parseClaudeLine(), resumeClaudeArgs()
    gemini.ts      — buildGeminiArgs(), parseGeminiLine(), resumeGeminiArgs()
    codex.ts       — buildCodexArgs(), parseCodexLine(), resumeCodexArgs()
    ollama.ts      — buildOllamaArgs(), parseOllamaLine(), resumeOllamaArgs()
  index.ts         — getAdapter(providerType) → AdapterModule
```

### AdapterModule interface

```typescript
type AdapterModule = {
  buildArgs(opts: BuildArgsOpts): string[]
  parseLine(line: string): TranscriptEvent | null
  resumeArgs(sessionId: string): string[]
  rateLimitPatterns: RegExp[]
}

type BuildArgsOpts = {
  systemPrompt: string
  userContext: string
  permissionMode: PermissionMode
  sessionId: string
}
```

### Provider-specific invocations

**Claude:**
- Create: `claude --print --output-format stream-json --verbose --system-prompt <prompt> --session-id <id> --permission-mode <mode> <userContext>`
- Resume: `claude --print --output-format stream-json --verbose --resume <id>`
- NDJSON events: `system` (subtype `init`), `assistant` (text blocks in `message.content`), `result` (usage fields: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `total_cost_usd`)

**Gemini:**
- Create: `gemini -p <prompt> --output-format stream-json --session-id <id>`
- Resume: `gemini -p <prompt> --output-format stream-json --session-id <id>`
- NDJSON events: `init` (`session_id`, `model`), `message` (`role`, `content`, `delta`), `result` (`stats` with per-model token breakdowns)

**Codex:**
- Create: `codex exec <prompt>`
- Resume: `codex exec <prompt> --session-id <id>`
- NDJSON events: `thread.started` (`thread_id`), `item.completed` (agent messages), `turn.completed` (usage), `turn.failed` (errors)

**Ollama:**
- Create: `ollama run <model>` with prompt on stdin
- No structured output — all lines emit as `raw` events
- No resume support
- No rate limit patterns

### Central buildArgs()

`prompts.ts` `buildArgs()` becomes a thin wrapper:

```typescript
export function buildArgs(opts: BuildArgsOpts & { providerType: ProviderType }): string[] {
  const adapter = getAdapter(opts.providerType)
  return adapter.buildArgs(opts)
}
```

The existing system prompt assembly (`buildSessionContext()`, skill injection, task context, context packs) remains unchanged — it produces the prompt string that the adapter receives.

---

## 2. Session Spawning

### spawnSession() rewrite

Replace `pty.spawn()` with `child_process.spawn()`:

```typescript
import { spawn, ChildProcess } from 'child_process'

const proc = spawn(provider.command, args, {
  cwd: opts.projectPath,
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe'],
})
```

### Global maps

- `ptyMap` → `procMap: Map<string, ChildProcess>`
- `wsMap` — unchanged
- `outputBuffer` — removed (replaced by `session_events` table)

### stdout handling

Read stdout line-by-line. Each line is:
1. Fed through `adapter.parseLine(line)` → if a `TranscriptEvent` is returned, insert into `session_events` and broadcast as `{ type: 'event', event }` over WebSocket
2. Broadcast as `{ type: 'output', data: line }` over WebSocket for the terminal view

### stderr handling

Captured and checked against `adapter.rateLimitPatterns`. On rate limit detection, session status set to `paused`, WebSocket clients notified with `{ type: 'rate_limit', provider }`.

### stdin handling

WebSocket `input` messages write to `proc.stdin.write(data + '\n')`.

### Process exit

`proc.on('close')` triggers the same cleanup as today: end session in DB, flush events to log file, update agent status, write artifact refs to task, log event, emit `session-ended` for orchestrator.

### spawnOrchestratorSession()

Same treatment — pipe-based, same adapter pattern.

---

## 3. Session Events Table

### Schema

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type       TEXT NOT NULL,
  role       TEXT,
  content    TEXT,
  metadata   TEXT,
  created_at TEXT NOT NULL
)
```

### Event types

| type | role | content | metadata |
|---|---|---|---|
| `init` | — | — | `{ sessionId, model, provider }` |
| `message` | `assistant` | message text | `{ delta: true }` if streaming |
| `thinking` | `assistant` | thinking text | — |
| `tool_call` | — | tool name | `{ input, toolUseId }` |
| `tool_result` | — | result text | `{ toolUseId, isError }` |
| `tokens` | — | — | `{ input, output, cached, costUsd }` |
| `error` | — | error message | `{ code, isRateLimit }` |
| `raw` | — | unparseable line | — |

### Lifecycle

1. **During session:** Events accumulate in `session_events`. Queryable for live dashboards (token count, tool call count, active status).
2. **On session end:** Flush all events to `data/sessions/<session_id>.jsonl` (one JSON object per line). Store file path on the task record in a `session_log` column. Delete rows from `session_events`.
3. **Result:** Table only holds events for active sessions. Stays lean. Archived logs are on disk, referenced from tasks.

### Task record changes

Add `session_log TEXT` column to the `tasks` table. Populated on session end with the path to the NDJSON log file. This replaces the current `dev_summary` debrief path for develop sessions — the structured log is more useful than a Claude-generated summary.

---

## 4. WebSocket Protocol

### Client → Server

| Message | Fields | Notes |
|---|---|---|
| `attach` | `sessionId` | Subscribe to session events. Replays from `session_events` table. |
| `input` | `data` | Written to `proc.stdin`. Newline appended. |

`resize` is removed (no PTY to resize).

### Server → Client

| Message | Fields | Notes |
|---|---|---|
| `output` | `data` | Raw stdout line for terminal view |
| `event` | `event: TranscriptEvent` | Parsed structured event |
| `status` | `state: 'active' \| 'ended'` | Session lifecycle |
| `rate_limit` | `provider` | Rate limit detected |

### Attach replay

On `attach`, the server:
1. Queries `session_events WHERE session_id = ? ORDER BY id ASC`
2. Sends each event as `{ type: 'event', event }`
3. Sends `{ type: 'status', state: 'active' | 'ended' }`

This replaces the 100-line buffer replay. Full event history is available for any mid-session attach.

---

## 5. Task Page Input Bar

### Component: SessionInput

Located on the task detail page, below the existing terminal output section.

```
+-------------------------------------+
| Terminal output (existing)          |
| ...                                 |
+-------------------------------------+
| [text input_______________] [Send]  |
+-------------------------------------+
```

### Behavior

- Visible when the task has an active session
- Hidden when no session or session ended
- On submit: sends `{ type: 'input', data: text + '\n' }` over WebSocket, clears input
- Enter submits, Shift+Enter for newline
- Disabled with "No active session" text when session is ended or paused

### Styling

Follows existing dark palette: `#0a0c0e` background, `#1c1f22` border, `#c8d0da` text, `#2563eb` send button.

---

## 6. Migration — Removals and Changes

### Removed

- `node-pty` npm dependency
- `ptyMap` global (replaced by `procMap`)
- `outputBuffer` global (replaced by `session_events` table)
- `RateLimitDetector` class (absorbed into adapter parsers)
- WebSocket `resize` message handling
- `debrief.ts` Claude re-summarization — the NDJSON session log replaces this. On session end, the `tokens` events provide usage stats, `tool_call`/`tool_result` events list files changed, and `message` events contain the assistant's work summary. The dashboard and orchestrator can read the archived `.jsonl` file directly instead of spawning Claude to re-summarize raw terminal output.

### Modified

- `session-manager.ts` — full rewrite of `spawnSession()` and `spawnOrchestratorSession()` from PTY to pipe
- `prompts.ts` — `buildArgs()` delegates to adapter layer
- `server.ts` — shutdown handler kills `ChildProcess` instead of PTY
- `handleWebSocket()` — replay from `session_events` table, drop `resize`
- `lib/db.ts` — add `session_events` table migration, add `session_log` column on tasks
- Task detail page component — add `SessionInput` component below terminal output

### Unchanged

- `resolveProvider()` — no changes
- Provider type system (`ProviderType`) — no changes
- Session DB records (`sessions` table) — no changes
- WebSocket endpoint `/ws` — no changes
- All existing API routes — no changes
- System prompt assembly (`buildSessionContext()`, skill injection, context packs) — no changes

---

## Testing

- **Adapter unit tests:** Each adapter's `buildArgs()` and `parseLine()` tested with sample NDJSON lines from `docs/CLI_OUTPUT_FORMATS.md`
- **Session spawning:** Integration test that spawns a mock process, verifies events land in `session_events`, verifies WebSocket broadcasts
- **Event lifecycle:** Test that session end flushes events to NDJSON file, deletes from table, stores path on task
- **WebSocket replay:** Test that `attach` replays full event history from DB
- **Input bar:** Component test for SessionInput — renders when active, hidden when ended, sends input message
- **Rate limit:** Test that adapter-specific error patterns trigger rate limit event and session pause
