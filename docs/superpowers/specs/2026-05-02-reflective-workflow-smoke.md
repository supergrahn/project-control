# Reflective Workflow — Manual Smoke Checklist

Pulled verbatim from `2026-05-02-reflective-workflow-design.md` (Integration / smoke section).

## Run results

| Date | Operator | Result | Notes |
| ---- | -------- | ------ | ----- |
| _YYYY-MM-DD_ | _name_ | _PASS / FAIL_ | _link to issue if FAIL_ |

## Prerequisites

- A local OpenAI-compatible provider (llama.cpp, LM Studio, etc.) running and configured in the app's provider settings.
- An embedding model loaded into that provider. If absent, the embed handler errors and the affected UIs (similar-sessions, dedup hints, critic findings) gracefully degrade — exercise this in step 9.
- Migrations 65–72 applied on the dev DB.

## Steps

1. Confirm a local provider is configured. Restart server. Look for "scheduler started" log line.
2. Open the Docs page on a fresh project. Within ~30s of viewing, the embed jobs should drain and the similar-sessions panel should populate after the next session ends.
3. Run a session against a task. Within 30s of session-end:
   - Drawer's Next section appears with extracted actions.
   - Session row in the DB has `grade` set.
   - If summary mentioned files that other tasks reference, those tasks' prep_notes get refreshed.
4. Open the router insights page. Provider rows now show success / partial / fail counts.
5. Save a new spec file. Within 60s, the docs page shows critic findings above the rendered body.
6. Edit the same spec file. The findings show "out of date — re-running" briefly, then update.
7. Open the Tasks page. Tasks with similar titles show a "↪ similar to" hint.
8. Stop the server. Restart. Pending jobs resume from where they left off.
9. Misconfigure the provider URL. Verify handlers log warnings and don't crash the runner. Restore the URL — pending work drains.
10. Spam-create 50 tasks. Verify the scheduler doesn't peg the CPU; load-average gate kicks in.
