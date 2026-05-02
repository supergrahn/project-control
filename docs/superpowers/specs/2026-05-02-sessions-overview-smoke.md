# Sessions Overview — Manual Smoke Checklist

## Run results

- **Walkthrough date:** _TBD_
- **Walkthrough operator:** _TBD_
- **Result:** _TBD_
- **Notes:** _TBD_

---

This checklist verifies the Sessions Overview slice end-to-end against a running dev server. It is the human verification gate for the slice; the automated test suite (962 passing) and production build cover the rest.

The 14 steps below are pulled verbatim from the spec (`docs/superpowers/specs/2026-05-02-sessions-overview-design.md`, "Smoke test" section).

1. Visit `/sessions` — see grid of active sessions across all projects (or empty-state copy)
2. Click filter "All" — list expands to include ended sessions
3. Click filter "Ended" — only finished sessions shown
4. Click a card — drawer slides in from right; terminal connects (status dot orange → green when active)
5. Type into the terminal — input is sent and the session echoes / responds
6. Click "Pop out ↗" — drawer closes, floating window opens for same session; both terminals briefly show the same output (expected)
7. Close floating window via its X
8. Open `/sessions?selected=<active-id>` directly via URL — drawer reopens, terminal reattaches fresh
9. While drawer open mid-output, hard-refresh the page — drawer reopens (URL preserved), no console errors, terminal reconnects
10. Click "Stop ⏹" on an active session inside the drawer — session ends, drawer closes, card moves to ended (visible under "All" or "Ended" filter)
11. Sidebar: click any "Active Sessions" entry → navigates to `/sessions?selected=<id>`, drawer opens; sidebar entry shows highlight
12. Dashboard: click "Open Terminal" on any `SessionAgentCard` → same behavior as #11
13. Task drawer Live Runs section: click "Open Terminal" → same behavior
14. With `?status=ended` filter, click an ended session card — drawer attaches; terminal shows whatever the server replays (likely empty or final output snapshot). Confirm no JS errors, just empty/static terminal.
