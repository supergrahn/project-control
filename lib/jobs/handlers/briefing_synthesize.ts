import type { Database } from 'better-sqlite3'
import { localComplete, getLocalModelName } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { getOpenNextActions } from '@/lib/briefing/openNextActions'
import { getCriticFlagged } from '@/lib/briefing/criticFlagged'
import { getTopTasks } from '@/lib/briefing/topTasks'
import { getRecentFailures } from '@/lib/briefing/recentFailures'
import { getDuplicateTasks } from '@/lib/briefing/duplicateTasks'
import { sectionSignature, type BriefingSections } from '@/lib/briefing/sectionSignature'
import { parseBriefingJson } from '@/lib/briefing/parseBriefingJson'
import { buildBriefingPrompt } from '@/lib/briefing/prompts'

export type BriefingSynthesizePayload = { scope: string }

function computeSections(db: Database, projectId?: string): BriefingSections {
  return {
    openNextActions: getOpenNextActions(db, { projectId }),
    criticFlagged: getCriticFlagged(db, { projectId }),
    topTasks: getTopTasks(db, { projectId }),
    recentFailures: getRecentFailures(db, { projectId }),
    duplicateTasks: getDuplicateTasks(db, { projectId }),
  }
}

function validRefIdsBySection(s: BriefingSections) {
  return {
    next_actions: new Set(s.openNextActions.map(x => x.sessionId)),
    critic_flagged: new Set(s.criticFlagged.map(x => String(x.findingId))),
    top_tasks: new Set(s.topTasks.map(x => x.taskId)),
    recent_failures: new Set(s.recentFailures.map(x => x.sessionId)),
    duplicate_tasks: new Set(s.duplicateTasks.map(x => `${x.aTaskId}::${x.bTaskId}`)),
  } as const
}

export async function handleBriefingSynthesize(db: Database, payload: BriefingSynthesizePayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn(`[briefing_synthesize] no local provider configured; skipping ${payload.scope}`)
    return
  }
  const projectId = payload.scope === '__all__' ? undefined : payload.scope
  const sections = computeSections(db, projectId)
  const signature = sectionSignature(sections)

  const existing = db.prepare(`SELECT section_signature FROM briefing_snapshots WHERE scope_key = ?`)
    .get(payload.scope) as { section_signature: string } | undefined
  if (existing?.section_signature === signature) {
    console.log(`[briefing_synthesize] no material change for ${payload.scope}; skipping LLM`)
    return
  }

  const prompt = buildBriefingPrompt(sections)
  let raw: string
  try {
    raw = await localComplete(provider, prompt, { maxTokens: 1200, timeoutMs: 60_000 })
  } catch (err) {
    console.warn(`[briefing_synthesize] LLM call failed for ${payload.scope}: ${err instanceof Error ? err.message : err}`)
    return  // Do NOT store fallback on transport failure — let next tick retry
  }

  const valid = validRefIdsBySection(sections)
  const parsed = parseBriefingJson(raw, valid)
  const now = new Date().toISOString()

  if (!parsed) {
    console.warn(`[briefing_synthesize] LLM output unparseable for ${payload.scope}; storing fallback empty narrative`)
    db.prepare(`
      INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at)
      VALUES (?, ?, '', '[]', ?, ?, ?)
      ON CONFLICT(scope_key) DO UPDATE SET
        narrative = excluded.narrative,
        priority_actions = excluded.priority_actions,
        section_signature = excluded.section_signature,
        model = excluded.model,
        generated_at = excluded.generated_at
    `).run(payload.scope, projectId ?? null, signature, getLocalModelName(provider), now)
    return
  }

  db.prepare(`
    INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_key) DO UPDATE SET
      narrative = excluded.narrative,
      priority_actions = excluded.priority_actions,
      section_signature = excluded.section_signature,
      model = excluded.model,
      generated_at = excluded.generated_at
  `).run(
    payload.scope,
    projectId ?? null,
    parsed.narrative,
    JSON.stringify(parsed.priorityActions),
    signature,
    getLocalModelName(provider),
    now,
  )
}
