# Ideation Flow Design

**Date:** 2026-03-27
**Status:** Approved

## Problem

Creating a new idea is a bare text field that produces an empty markdown file. There is no way to immediately engage AI ideation, no structured capture, and no persistent way to track sessions tied to specific documents.

## Design

### 1. Idea Capture Modal

Replace `NewFileDialog` on the Ideas page with a new `IdeaCaptureModal`:

- **Title field** (required) — becomes the filename
- **Pitch textarea** (optional) — freeform description, saved as the initial body of the `.md` file

On confirm:
1. Creates the idea file (title as filename, pitch as content)
2. Immediately launches an `ideate` session
3. Opens a floating session window for that session

If pitch is empty, Claude opens by asking "tell me about this idea."

### 2. Ideate Session Prompt

New `ideate` phase added to `lib/prompts.ts`:

- Reads the idea file (title + pitch)
- Uses `consult-gemini` skill if available — runs a back-and-forth with Gemini before surfacing conclusions
- Asks the user clarifying questions (problem, users, constraints)
- Synthesises the conversation into a structured brainstorm document saved alongside the idea file (e.g. `my-idea-brainstorm.md`)

Gemini integration is opportunistic — if the skill is not present in `~/.claude/skills/`, Claude ideates solo.

### 3. Session Frontmatter on Documents

Every idea, spec, plan, and developing document stores session state in YAML frontmatter:

```yaml
---
title: My Idea
ideate_session_id: abc-123
ideate_log_id: null
---
```

| State | `session_id` | `log_id` |
|-------|-------------|---------|
| Never run | null | null |
| Active | set | null |
| Closed | set | set |

Same pattern for all phases using prefix: `ideate_`, `spec_`, `plan_`, `develop_`.

**On session close:** server writes `log_id` (path to the saved markdown log) into the frontmatter.

**Log files** are saved as markdown in a `logs/` directory within the project's ideas/specs/plans directory (e.g. `my-idea-ideate-log.md`). Clicking the log link opens the existing `FileDrawer` to render it.

### 4. Card States (all phases)

| State | UI |
|-------|----|
| No session | Action button ("Ideate" / "Spec" / "Plan" / "Develop") |
| Active session | "▶ Live" badge — clicking opens/focuses floating window |
| Closed session | "View log" link → `FileDrawer` with markdown log + "Resume" button |

**Resume:** starts a new session with the previous log prepended as context so Claude knows what was previously discussed.

### 5. Floating Session Windows

Each active session opens as an independent **draggable, resizable floating window**:

```
┌─ My Idea · ideate ─────────────── [─][×] ┐
│                                           │
│   xterm terminal (fully interactive)      │
│                                           │
└───────────────────────────────────────────┘
```

- **Drag** by the title bar
- **Resize** by edges and corners
- **Minimize** collapses to a small pill at the bottom of the screen (title + status indicator)
- Multiple windows can be open simultaneously and arranged freely
- Clicking "▶ Live" on a card brings that window to front or unminimizes it
- **Closing (×)** kills the session and triggers log write + frontmatter update
- Brain icon in TopNav shows a badge with the count of active sessions; clicking it toggles minimise-all / restore-all

### 6. Brain Icon Behaviour (TopNav)

- Badge shows count of active sessions (hidden when 0)
- Single click: if any windows are minimised, restore all; if all visible, minimise all
- This replaces the old AssistantPanel toggle

## Out of Scope

- Persisting window positions across page refreshes
- Session history beyond the most recent log per phase
- Multi-user / shared sessions
