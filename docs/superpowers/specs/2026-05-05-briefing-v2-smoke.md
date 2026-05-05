# Briefing v2 — Manual Smoke

## Per-project filter

1. `npm run dev` and open `/briefing`
2. Top of page shows ProjectPicker dropdown — "All projects" selected by default
3. Pick a project → URL gains `?projectId=<id>`; sections re-fetch and only show that project's data
4. Pick "All projects" → URL clears; cross-project view returns

## Action buttons

5. Click **Continue** on an Open Next Steps item → spawns continuation session, navigates to `/sessions?selected=...`
6. Click **Fix this** on a Critic Flagged item → POSTs to `/api/critic-findings/[id]/fix` with the issue trio, spawns spec/plan session, navigates to `/sessions?selected=...`
7. Click **Start** on a Top Tasks item → spawns session in matching phase (idea→brainstorm, spec→spec, plan→develop), navigates
8. Click **Continue** on a Recent Failure item → same as Open Next Steps
9. Click **Dismiss** on a Duplicate Tasks pair → POSTs canonical pair to `/api/dedup-dismissals`; SWR revalidates; pair disappears

## Pre-computation (overnight)

10. Stop dev server overnight, restart at 5–6am next morning. Watch logs:
    - `briefingPreWarmTrigger` fires on the first tick after 5am local time
    - `briefing_synthesize` jobs enqueue (one per project + one for `__all__`)
    - Jobs run; snapshot rows appear in `briefing_snapshots`
11. Open `/briefing` → hero renders narrative + priority actions, with footer "Generated <time> by <model>"
12. Click **Refresh now** → button shows "Refreshing…" and disables; new generated_at appears within ~5–60s; button re-enables
13. Trigger a session grade='no' → check `pending_jobs` has `briefing_synthesize:__all__:{today}:gradechange` row enqueued
14. Trigger a critic finding with severity 'critical' or 'important' → check pending_jobs has `:criticchange` suffix

## Hero stale-refId behavior

15. Manually delete a session referenced by snapshot's priority_actions → reload `/briefing` → that priority action is silently dropped from the rendered list (snapshot still shows other actions)

## Edge cases

16. New install with no projects: ProjectPicker shows only "All projects"; sections empty; hero shows "Synthesizing morning briefing…" briefly then settles after the first synthesis (or stays in that state if local LLM is unavailable)
17. Local LLM down (no provider configured or unreachable): snapshot remains null but live grid renders normally; hero shows "Synthesizing morning briefing…" indefinitely; no errors surface in UI
18. LLM returns malformed JSON: snapshot persists with `narrative=''` and `priority_actions='[]'`; live grid renders; next material change triggers retry

## Cross-tab dedup

19. Open `/briefing` in two tabs at the same time. Watch the Network tab: each tab fires its own `/api/briefing` GET, but the lazy-enqueue collapses (dedup_key) so only one `briefing_synthesize` job runs per scope per day.

## Scope key collision

20. Project ids are UUIDs (verified in `lib/db.ts:526`'s `randomUUID()` call), so the `__all__` sentinel cannot collide. No project named or ID-equal to `'__all__'` should exist.
