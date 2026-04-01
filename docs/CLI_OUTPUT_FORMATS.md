# CLI Output Formats — Gemini, Codex, Claude Code

Document of what each CLI outputs during a session, captured 2026-04-01.

## Gemini CLI

### Versions & Commands
- Version: 0.35.3
- Non-interactive mode: `gemini -p "prompt" --output-format <format>`
- Formats: `text`, `json`, `stream-json`

### Output Format: stream-json
**Event stream format (newline-delimited JSON):**

```json
{"type":"init","timestamp":"2026-04-01T09:33:55.102Z","session_id":"000c216b-bf0a-401d-9a86-10ed6c902bb7","model":"auto-gemini-3"}
{"type":"message","timestamp":"2026-04-01T09:33:55.102Z","role":"user","content":"What is 2+2?"}
{"type":"message","timestamp":"2026-04-01T09:34:11.934Z","role":"assistant","content":"2+2 is 4.","delta":true}
{"type":"result","timestamp":"2026-04-01T09:34:11.993Z","status":"success","stats":{"total_tokens":13404,"input_tokens":13290,"output_tokens":32,"cached":0,"input":13290,"duration_ms":16892,"tool_calls":0,"models":{"gemini-2.5-flash-lite":{"total_tokens":4186,"input_tokens":4122,"output_tokens":25,"cached":0,"input":4122},"gemini-3-flash-preview":{"total_tokens":9218,"input_tokens":9168,"output_tokens":7,"cached":0,"input":9168}}}}
```

**Event Types:**
- `init` — Session started. Fields: `session_id`, `model`, `timestamp`
- `message` — User or assistant message. Fields: `role` ("user"/"assistant"), `content`, `delta` (true = streaming), `timestamp`
- `result` — Final result with stats. Fields: `status`, `stats` (tokens, models, tool_calls, duration_ms)

### Output Format: Interactive (Plain Text Mode)
**Startup output (stderr) + Response (stdout):**

```
Loaded cached credentials.
[ERROR] [IDEClient] Failed to connect to IDE companion extension. Please ensure the extension is running. To install the extension, run /ide install.
Loading extension: code-review
Loading extension: conductor
Loading extension: context7
Scheduling MCP context refresh...
Executing MCP context refresh...
[WARN] Skipping unreadable directory: /tmp/snap-private-tmp (EACCES: permission denied, scandir '/tmp/snap-private-tmp')
...
MCP context refresh complete.
Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.
I have access to several categories of tools designed for codebase exploration, file manipulation, system interaction, and specialized research.

### **File System & Search**
*   **`list_directory`**: Lists files and subdirectories.
*   **`read_file`**: Reads specific lines or entire files (supports text, images, and PDFs).
...
```

**Characteristics:**
- Initialization messages to stderr (MCP servers, extension loading)
- Warning messages for permission issues
- Final response to stdout
- Markdown-formatted response content

### Output Format: json
**Single JSON object at end:**

```json
{
  "session_id": "c2f3af2c-42a7-41a9-8d1d-6693ef9bdc60",
  "response": "...",
  "stats": {
    "models": {
      "gemini-2.5-flash-lite": {
        "api": {
          "totalRequests": 3,
          "totalErrors": 2,
          "totalLatencyMs": 1273
        },
        "tokens": {
          "input": 4131,
          "prompt": 4131,
          "candidates": 40,
          "total": 4258,
          "cached": 0,
          "thoughts": 87,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 0,
      "totalSuccess": 0,
      "totalFail": 0,
      "totalDurationMs": 0,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 0
      },
      "byName": {}
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

**Fields:**
- `session_id` — Unique session identifier
- `response` — Final response text
- `stats` — Detailed statistics:
  - `models` — Per-model metrics (requests, errors, latency, tokens)
  - `tools` — Tool call statistics (calls, successes, failures, decisions)
  - `files` — File modification summary

---

## Codex CLI

### Versions & Commands
- Version: codex-cli 0.114.0
- Non-interactive mode: `codex exec "prompt"`
- Runs in git repositories only

### Output Format: Plain Text (Structured)

```
OpenAI Codex v0.114.0 (research preview)
--------
workdir: /tmp/test_proj
model: gpt-5.3-codex
provider: openai
approval: never
sandbox: read-only
reasoning effort: high
reasoning summaries: none
session id: 019d4863-951e-79f2-80c9-b8d8af706864
--------
user
Create a simple hello.js file that logs 'Hello World'
mcp startup: no servers
codex
I'll create `hello.js` in `/tmp/test_proj` with a single `console.log('Hello World')` line, then confirm it exists.
codex
I couldn't create the file because this workspace is currently mounted read-only (`permission denied` on write).

Use this in `/tmp/test_proj` to create it:

```bash
cat > hello.js <<'EOF'
console.log('Hello World')
EOF
```

tokens used
1,926
...
```

**Metadata Section:**
- `workdir` — Working directory
- `model` — Model used
- `provider` — Provider (openai)
- `approval` — Approval mode (never, default, auto_edit, etc.)
- `sandbox` — Sandbox mode (read-only, etc.)
- `reasoning effort` — Reasoning setting
- `session id` — Unique session identifier

**Response Structure:**
- Lines prefixed with `user` — User prompt
- Lines prefixed with `codex` — Agent response
- Lines with `mcp startup` — MCP server status
- `tokens used` — Token count for this exchange
- Tool outputs interspersed with responses

---

## Claude Code CLI

### Versions & Commands
- Version: 2.1.89 (Claude Code)
- Interactive mode: `claude` (PTY-based)
- Input via stdin (accepts prompts, commands)

### Output Format: Raw PTY Output (Plain Text)

**Characteristics:**
- Unstructured text output to stdout/stderr
- Interactive PTY session (line-by-line)
- No explicit JSON events
- Output includes:
  - Model responses
  - Tool execution logs (reads, writes, bash commands)
  - File paths, diffs, error messages
  - Formatting/markdown rendering
  - ANSI escape sequences (colors, styles)

**Example Output Stream:**
```
I'm ready to create a `hello.js` file with a simple "Hello, World!" message. Please approve this action to proceed.
```

### Rate Limit Detection
Pattern matching in raw output:
- Claude: `rate_limit_exceeded`, `overloaded_error`, `\b529\b`
- Codex: `rate_limit_exceeded`, `quota_exceeded`, `\b429\b`
- Gemini: `RESOURCE_EXHAUSTED`, `quota exceeded`, `\b429\b`

---

## Summary Comparison

| Aspect | Gemini | Codex | Claude Code |
|--------|--------|-------|------------|
| **Format** | Stream-JSON (events) | Plain text (structured) | Raw PTY (unstructured) |
| **Session ID** | JSON `session_id` field | Text `session id:` line | Stored in DB, not in output |
| **Statistics** | Detailed JSON stats object | `tokens used` line | No built-in stats in output |
| **Tool Calls** | Tracked in `stats.tools` | Embedded in response text | Tool execution logs in output |
| **Streaming** | `delta: true` on messages | N/A (non-streaming in exec) | Continuous PTY stream |
| **Parsing** | JSON line-by-line | Regex extraction | Pattern matching on raw text |

---

## Implementation Notes for project-control

### Gemini Integration
- Parse stream-json format line-by-line (newline-delimited JSON)
- Extract `session_id` from `init` event
- Track tool calls from `result` event
- Emit WebSocket events for each `type` change

### Codex Integration
- Parse plain text output for metadata (session id, tokens, model)
- Regex extraction for structured fields
- Emit WebSocket events on response boundaries
- Track tokens from `tokens used` line

### Claude Code Integration (Current)
- Continue with raw PTY output stream
- WebSocket event per data chunk
- Rate limit detection via regex patterns
- Session metadata stored in DB

