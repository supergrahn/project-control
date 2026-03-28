# Orchestrator Drawer Design

**Date:** 2026-03-28

## Overview

A global sidebar drawer that shows all active sessions across the Ideas, Specs, Plans, and Developing pages in a module-list style, with a combined live feed of raw output from all active sessions aggregated directly in the UI.

## Trigger

A toggle button in the global nav bar (top-right). Shows a live badge with the count of active sessions across all pages; the badge pulses when any session is active. Clicking opens/closes the drawer.

## Drawer Structure

Fixed-width (~320px), slides in from the right, `z-50`, does not push page content.

### 1. Header

"Orchestrator" label + active session count + close button.

### 2. Module List

A vertically stacked list of all sessions from all four pages (Ideas, Specs, Plans, Developing). Each row:

- **Left:** Square numbered badge, colored by phase:
  - Idea → purple
  - Spec → blue
  - Plan → amber
  - Develop → green
- **Title:** Item name, bold, single line
- **Right:** Status icon:
  - Active → animated pulse dot (phase color)
  - Completed → checkmark
  - Not started / no session → lock icon
- **Active row:** Colored left-border accent + slightly lighter row background matching phase color
- **Completed rows:** Dimmed
- **Inactive rows:** Dimmest

Rows are ordered: active first, then pending, then completed.

### 3. Divider

### 4. Combined Live Feed

A scrolling log area below the module list. The UI opens one WebSocket connection per active session and interleaves raw PTY output. No orchestrator dependency.

Each feed line:
- Small colored phase dot (matching source session's phase color)
- Session label (item name, truncated to fit)
- Relative timestamp (e.g. "2m ago")
- Raw output text, monospace, small font

Auto-scrolls to bottom as new output arrives. Newest entries at the bottom.

## Data Flow

1. Drawer reads active sessions from existing session state (already tracked via `useSessionWindows` / session hooks).
2. For each active session, opens a WebSocket (`/ws`) and sends `{ type: 'attach', sessionId }`.
3. Incoming `output` messages are appended to a shared feed buffer with metadata (sessionId, label, phase, timestamp).
4. Feed renders from buffer, auto-scrolling.
5. On session end, WebSocket closes; the session row transitions to completed state.

## What This Is Not

- Does not use the orchestrator MCP server or `OrchestratorDecision` data (future enhancement).
- Does not interpret or annotate output — raw PTY text only.
- Does not replace the existing `OrchestratorFeed` component (that remains for decision/summary data).
