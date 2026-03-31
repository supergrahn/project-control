# Providers (Track B)

**Goal:** Abstract the hardcoded Claude binary into a configurable provider layer supporting Claude Code, Codex, Gemini CLI, and Ollama. Provider selection is hierarchical (global → project → agent → task) with a pause-and-prompt fallback when a provider hits its rate limit.

---

## Data Model

### New `providers` table

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  command TEXT NOT NULL,
  config TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
)
```

| Column | Values / Notes |
|---|---|
| `type` | `claude` / `codex` / `gemini` / `ollama` |
| `command` | Binary path or shell command, e.g. `/home/user/.local/bin/claude` |
| `config` | JSON object with type-specific fields — see below |
| `is_active` | `1` = available for use; `0` = disabled, never selected |

**`config` shape per type:**

| Type | Config fields |
|---|---|
| `claude` | `{ model: string, flags: string[] }` e.g. `{ model: "claude-sonnet-4-6", flags: ["--permission-mode", "bypassPermissions"] }` |
| `codex` | `{ model: string, flags: string[] }` |
| `gemini` | `{ model: string, flags: string[] }` |
| `ollama` | `{ host: string, model: string }` e.g. `{ host: "http://localhost:11434", model: "qwen2.5-coder" }` |

### Override columns on existing tables

| Table | Column | Notes |
|---|---|---|
| `projects` | `provider_id TEXT` | nullable, added via `ALTER TABLE` migration |
| `tasks` | `provider_id TEXT` | nullable, added via `ALTER TABLE` migration |
| `agents` | `provider_id TEXT` | nullable, defined in Track C schema |

---

## Provider Resolution

At session spawn time, `resolveProvider(opts)` walks the hierarchy and returns the first non-null provider:

```
task.provider_id
  → agent.provider_id (if session has an agent)
    → project.provider_id
      → first active provider in the providers table (ordered by created_at)
```

If no providers are configured, spawn fails with a clear error directing the user to `/settings/providers`.

---

## Rate Limit Detection

The PTY output stream is already monitored per session. A `RateLimitDetector` watches incoming text for known error patterns:

| Provider | Patterns |
|---|---|
| `claude` | `rate_limit_exceeded`, `overloaded_error`, `529` |
| `codex` | `rate_limit_exceeded`, `quota_exceeded`, `429` |
| `gemini` | `RESOURCE_EXHAUSTED`, `quota exceeded`, `429` |
| `ollama` | Not applicable (local, no quota) |

On match:
1. Session status is set to `paused` (new status value alongside `active` / `ended`)
2. A notification is surfaced: **"[Provider name] hit its rate limit. Choose a replacement provider."**
3. User sees a dropdown of available active providers (excluding the current one)
4. On selection, session resumes with the new provider — the spawn logic restarts the PTY process with the replacement binary, passing the existing session context

---

## Provider Management UI

Route: `/settings/providers`

List view showing all configured providers with:
- Name, type badge, command path
- Active toggle (inline)
- **Test** button — runs a minimal health-check command and shows pass/fail
- Edit and Delete actions

**Add provider form:**
- Name (text)
- Type (select: Claude / Codex / Gemini / Ollama)
- Command (text, with placeholder per type)
- Config fields rendered dynamically based on type
- Test connection before saving

---

## File Map

| Action | File |
|---|---|
| Modify | `lib/db/index.ts` — add `providers` table + `provider_id` migrations on `projects` and `tasks` |
| Create | `app/api/providers/route.ts` — `GET` list, `POST` create |
| Create | `app/api/providers/[id]/route.ts` — `GET`, `PATCH`, `DELETE` |
| Create | `lib/sessions/resolveProvider.ts` — hierarchical resolution logic |
| Create | `lib/sessions/rateLimitDetector.ts` — stream parser for rate limit signals |
| Modify | `lib/sessions/spawn.ts` — call `resolveProvider` before spawning, wire `RateLimitDetector` |
| Create | `app/(dashboard)/settings/providers/page.tsx` — provider management UI |
| Modify | `hooks/useProjects.tsx` — add `provider_id` to `Project` type |
| Modify | `lib/db/tasks.ts` — add `provider_id` to `Task` type and queries |

---

## Testing

- `resolveProvider`: returns task-level override when set; falls back correctly through each level; throws when no providers configured
- `RateLimitDetector`: emits event on each known pattern per provider type; no false positives on normal output
- Provider API: CRUD operations, `is_active` toggle persists
- Provider management UI: add/edit/delete, test button shows result, disabled providers excluded from resolution
