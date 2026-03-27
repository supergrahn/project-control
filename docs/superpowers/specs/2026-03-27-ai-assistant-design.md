# AI Project Assistant — Design Spec

**Date:** 2026-03-27

---

## Goal

Add a contextual AI assistant sidebar that acts as a project manager copilot — it proactively surfaces what needs attention, proposes next actions, helps draft ideas/specs, and executes dashboard actions through natural language.

## Background

The dashboard has rich pipeline data (Up Next, audit status, events, memory) but the user must manually scan it to decide what to do. The assistant synthesizes this data into actionable suggestions and lets users act on them conversationally.

---

## Architecture

### New files

```
lib/
  assistant.ts              ← builds assistant context from dashboard data, generates suggestions
app/
  api/
    assistant/
      route.ts              ← POST — sends user message + context to Claude, streams response
      suggestions/
        route.ts            ← GET — returns proactive suggestions based on pipeline state
components/
  AssistantPanel.tsx         ← collapsible right sidebar with suggestions + chat
hooks/
  useAssistant.ts            ← manages chat state, suggestions, streaming
```

### How it works

1. **Proactive suggestions** — `GET /api/assistant/suggestions` analyzes pipeline state (stale specs, unaudited plans, idle projects, blockers) and returns 3-5 action cards without any LLM call (pure logic, fast)
2. **Chat interaction** — `POST /api/assistant` sends the user's message + pipeline context to `claude --print`, streams the response back via ReadableStream
3. **Action execution** — the assistant's suggestions include action buttons that directly call existing APIs (create file, launch session, run audit, etc.)

### Context injection

The assistant prompt includes:
- Current pipeline state (from `buildDashboardData`)
- Active project's memory files
- Recent events (last 10)
- Current page context (which page the user is on)

This is assembled by `lib/assistant.ts` and injected as the system prompt.

---

## Suggestions Engine (`lib/assistant.ts`)

Pure function, no LLM call. Scans pipeline data and returns prioritized suggestions.

### Suggestion types

```typescript
type Suggestion = {
  id: string
  priority: 'high' | 'medium' | 'low'
  icon: string           // emoji
  title: string          // short headline
  description: string    // one sentence
  action?: {
    label: string        // button text
    type: 'navigate' | 'launch_session' | 'run_audit' | 'create_file'
    payload: Record<string, string>  // params for the action
  }
}
```

### Rules

| Condition | Priority | Suggestion |
|-----------|----------|------------|
| Plan has audit with blockers | high | "Fix blockers in {plan}" → navigate to plan |
| Plan has no audit | medium | "Audit {plan} before developing" → run audit |
| Spec has no plan (>3 days) | medium | "Create a plan for {spec}" → launch plan session |
| Idea has no spec (>5 days) | low | "Flesh out {idea} into a spec" → launch spec session |
| Feature ready to develop (audit clean) | high | "Start developing {feature}" → launch develop session |
| No active sessions across all projects | low | "All quiet — pick something from Up Next" |
| Project has no memory files | low | "Set up project memory for {project}" → navigate to memory |

---

## Chat API (`POST /api/assistant`)

### Request
```typescript
{
  message: string
  projectId?: string       // current active project
  page?: string            // current page ('/plans', '/specs', etc.)
  history?: Array<{ role: 'user' | 'assistant'; content: string }>  // last 10 messages
}
```

### Response
Streaming text response via ReadableStream (same `claude --print` pattern as audit).

### System prompt

Built by `lib/assistant.ts`:

```
You are the Project Assistant for a development workflow dashboard.

Your role:
- Help the user decide what to work on next
- Refine rough ideas into structured specs
- Suggest improvements to plans
- Draft markdown content when asked
- Be concise and actionable

Current pipeline state:
{JSON summary of up next, in progress, pipeline counts, health}

Active project: {name} ({path})
Recent events: {last 10 events}
Project memory: {memory file summaries}

The user is currently on the {page} page.
```

---

## UI — `AssistantPanel.tsx`

### Layout

Collapsible right sidebar, 320px wide. Toggle button in the TopNav (brain icon).

```
┌─────────────────────────────────────────┐
│ 🧠 Assistant                    [close] │
├─────────────────────────────────────────┤
│ SUGGESTIONS                             │
│ ┌─────────────────────────────────────┐ │
│ │ 🔴 Fix 2 blockers in auth-plan     │ │
│ │     [View Plan →]                   │ │
│ ├─────────────────────────────────────┤ │
│ │ 🟢 render-pipeline ready to build  │ │
│ │     [Start Developing →]           │ │
│ ├─────────────────────────────────────┤ │
│ │ 🔍 3 plans unaudited               │ │
│ │     [Audit All →]                  │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ CHAT                                    │
│ ┌─────────────────────────────────────┐ │
│ │ [User] I want to add a plugin sys  │ │
│ │ [AI] Here's a rough spec outline:  │ │
│ │   ## Plugin System                 │ │
│ │   - Extension points...            │ │
│ │                     [Save as Idea] │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Ask the assistant...          [↵]  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Interactions

- **Suggestion cards** — click action button to execute (navigate, launch session, etc.)
- **Chat input** — type message, press Enter to send
- **Streaming response** — assistant response streams in real-time
- **"Save as Idea"** — button on assistant responses to save markdown content as a new idea file
- **Toggle** — brain icon in TopNav toggles sidebar open/closed, persisted to localStorage

### What makes it NOT a chatbot

1. **Suggestions are instant** — no LLM call, pure logic from pipeline data
2. **Actions are one-click** — buttons execute real dashboard operations
3. **Context is automatic** — it knows your pipeline state, you don't have to explain
4. **It speaks first** — suggestions appear without user prompting
5. **Output is files** — "Save as Idea/Spec" turns conversations into artifacts

---

## Edge Cases

- No projects registered → "Get started by registering a project in Settings"
- All projects have no configured dirs → suggestions are empty, show onboarding tip
- Claude binary not found → chat disabled, suggestions still work
- Empty pipeline → "All caught up" with ideation prompt

## Performance

- `GET /api/assistant/suggestions` is pure logic, <10ms
- `POST /api/assistant` streams from `claude --print`, latency depends on Claude
- Suggestions refresh on page navigation and every 30s
- Chat history kept in component state (last 20 messages), not persisted

---

## Build Order

1. `lib/assistant.ts` — suggestion engine + context builder
2. `app/api/assistant/suggestions/route.ts` — GET suggestions
3. `app/api/assistant/route.ts` — POST chat with streaming
4. `hooks/useAssistant.ts` — chat state + suggestions hook
5. `components/AssistantPanel.tsx` — sidebar UI
6. Wire into layout — toggle button in TopNav, panel in dashboard layout
