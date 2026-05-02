# Session Summary + Originator Links — Manual Smoke Checklist

**Slice:** `feature/session-summary`
**Spec:** `docs/superpowers/specs/2026-05-02-session-summary-design.md`
**Plan:** `docs/superpowers/plans/2026-05-02-session-summary.md`

## Run results

| Field    | Value         |
|----------|---------------|
| Date     | _YYYY-MM-DD_  |
| Operator | _your name_   |
| Build    | _commit SHA_  |
| Result   | _pass / fail_ |
| Notes    | _free text_   |

Re-run this checklist before merging the slice and after any non-trivial follow-up. One row per execution; copy the table when re-running.

---

## Checklist

1. Open Docs page, pick a doc with no sessions → "No sessions yet" empty state
2. Start a session from that doc; while running, panel shows the live session card with "Session in progress…"
3. End the session via Stop in the drawer; reload docs page → card now shows the captured summary (the agent's last message)
4. Confirm summary text matches what was last visible in the terminal
5. Click the card → navigates to `/sessions?selected=<id>`, drawer opens with terminal scrollback
6. In the drawer, see "From <doc>.md ↗" header line; click it → navigates to the docs page with that file pre-selected (`?file=<path>`)
7. Open Sessions overview page; SessionGridCard shows "from <doc>.md" in meta row
8. Open task detail for a task with at least one ended session → "Past Sessions" section lists the session with its summary
9. Kill an active session before the agent emits any text → summary slot shows "No final message captured"
10. Verify the agent debrief is unchanged (we didn't touch debrief generation)
