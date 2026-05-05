# Cross-Project Tasks — Manual Smoke

1. `npm run dev`
2. Open the sidebar — confirm Global section has both "Briefing" and "Tasks"
3. Click Tasks → page navigates to `/tasks`
4. With no projects configured: page renders empty state from ExternalTaskDashboard
5. With one project + one active source config (Jira/Monday/DoneDone/GitHub):
   - Page populates with that project's tasks
   - Each card shows the owner project's name tag near the source badge
6. With multiple projects + multiple configs:
   - All projects' tasks aggregate
   - Source badges + owner project tags disambiguate per card
7. Click any task card → drawer opens with full details (existing ExternalTaskDetailDrawer)
8. Stop one source mid-session: refresh — that source's tasks disappear, others remain, and the error appears in the dashboard's error banner. Other projects' tasks still render.
9. Verify the existing project-scoped Tasks page at `/projects/{id}/tasks` still works unchanged (it now goes through the same component but with apiUrl undefined → falls back to project-scoped URL).
10. SWR autoRefresh: open DevTools Network, confirm `/api/external-tasks` is called every ~120s.

## Edge cases

- Project with zero active configs: contributes zero tasks and zero errors (silent skip).
- Project with one active config that throws: surfaces a single error string `"{ProjectName} · {AdapterName}: {message}"` in the errors[] response.
- Task with `prep_status='prepped'` in the synced tasks table: card shows the violet 🔮 Prepped indicator (existing behavior preserved through the bridge).
