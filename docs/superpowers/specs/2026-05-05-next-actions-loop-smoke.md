# Next-Actions Loop — Manual Smoke

Run after the slice merges to main. The reflective-workflow infrastructure must be running locally for the carry-forward signal to populate.

## Setup

1. Start dev server (`npm run dev`)
2. Confirm a local provider is configured (Settings → Providers) so `extract_next_actions` can run

## Carry-forward path (automatic, no UI click)

3. Spawn a session for any task or document via the existing UI
4. Let it run briefly, end the session manually
5. Wait ~30s for the background `extract_next_actions` job to fire (job runner polls every 15s)
6. Refresh, open the session drawer — verify Next-actions section renders with at least one item
7. Close the drawer
8. Spawn a SECOND session for the SAME task or document via the sidebar/dashboard (NOT via the Continue button)
9. Open the new session's drawer; inspect its `user_context` (DB or Properties Panel)
   - Expected: starts with `<!-- next-actions:auto -->` block referencing the prior session's actions
   - Expected: prep packet (if any) follows the next-actions block
   - Expected: original input (whatever was typed) follows last
10. Spawn a THIRD session for the same originator
    - Expected: picks up the most-recent ENDED session's next_actions, NOT the first session's

## Continue button (one-click)

11. Open any ended session that has a populated Next-actions section AND has either `task_id` or `source_file` set
12. Click the **Continue →** button
    - Expected: button shows "Spawning…" briefly
    - Expected: page navigates to `/sessions?selected={newId}`
    - Expected: new session label is `Continuation: {original label}`
    - Expected: new session's user_context contains `<!-- next-actions:auto -->`
13. From the continuation session, click Continue again
    - Expected: still shows "Continuation: {original label}" (no double-prefix)
14. Open a session with no `task_id` AND no `source_file` (e.g. a standalone session)
    - Expected: Continue button is hidden
15. Open a session with empty next_actions array
    - Expected: Continue button is hidden
16. Open an active session (status='active') for a task, then try clicking Continue from a different ended session that shares the same `task_id`
    - Expected: button shows error "a session for this task is already active"
17. Open an orchestrator-phase session with originator
    - Expected: Continue would return 400 "orchestrator sessions cannot be continued" (this is the API guarding TypeScript Phase mismatch)

## Idempotency

18. Hit "Restart with provider" on a session that already has carry-forward
    - Expected: respawn does NOT double-inject — the persisted user_context already contains the marker

## Failure modes (visual confirmation)

19. Stop the local provider; trigger Continue
    - Expected: error rendered inline as `role="alert"` text
    - Expected: dev server log shows the spawn failure cause; new session row may appear with `status='needs_route_retry'`

## Negative tests (verify carry-forward does NOT cross originators)

20. Create task A, run a session that produces next_actions referencing file X
21. Create task B (different id), spawn a session for task B; verify the next_actions from task A's session are NOT injected
22. Open document `/path/foo.md`, run a session; carry-forward should be scoped to that exact path. Spawn a session for `/path/bar.md` — verify no carry-forward
