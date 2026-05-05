# Briefing — Manual Smoke

Run after the slice merges to main.

1. `npm run dev`
2. Open the sidebar — confirm a "Global" section appears at the top with "Briefing" link
3. Click Briefing → page navigates to `/briefing`
4. Empty DB or fresh project: should show "All clear" empty state
5. After running real reflective workflow for a while: each section populates with relevant items
   - Open next steps: ENDED sessions in last 14 days with parsed next_actions
   - Critic flagged: spec/plan files with severity=critical or high in `critic_findings`
   - Tasks worth picking up: tasks in idea/spec/plan status, ranked plan→spec→idea
   - Recent failures: sessions with grade=no or partial in last 7 days
   - Possible duplicates: task pairs with cosine similarity ≥ 0.85
6. Click each item type:
   - Next-action item → `/sessions?selected={sessionId}`
   - Critic finding → `/projects/{projectId}/specs` or `/plans` (no `?file=` v1)
   - Top task → `/projects/{projectId}/{ideas|specs|plans}` matching status
   - Recent failure → `/sessions?selected={sessionId}`
   - Duplicate pair → `/projects/{projectId}/ideas`
7. Open DevTools Network → confirm `/api/briefing` GETs every 60s automatically
8. Open two tabs → SWR shares one fetch per 60s window (only one network call total per window)
9. Switch to another tab and back — `revalidateOnFocus` triggers an extra GET
10. Stop the local provider; refresh: page should still load (one aggregator throwing should not break others — duplicateTasks would just return [])
11. Confirm sidebar Briefing link's active state highlights when on `/briefing`

## Edge cases

- A session with valid `next_actions` JSON but `next_actions: []` and `open_questions: []` should NOT appear in Open next steps
- A critic finding with severity=medium or low should NOT appear in Critic flagged
- A successfully-graded session (`grade='yes'`) should NOT appear in Recent failures
- Embeddings with different `model` strings within the same project should NOT be paired (group by model+dim)
- A task without an embedding row will not appear in Possible duplicates (acceptable — it's signal-driven)
