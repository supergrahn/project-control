import type { Database } from 'better-sqlite3'
import { localComplete } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { recordOutcome } from '@/lib/router/recordOutcome'
import type { Outcome } from '@/lib/router/types'
import { enqueueJob } from '../runner'

export type GradeSessionPayload = { session_id: string }

const PROMPT = (taskTitle: string, goal: string, phase: string, summary: string) => `
Task: ${taskTitle}
Goal: ${goal}
Phase: ${phase}

Agent's final summary:
${summary}

---

Question: Did the agent achieve the task's goal in this session?
Respond with EXACTLY one JSON object, no preamble:
{ "grade": "yes" | "partial" | "no", "reason": "<one sentence>" }
`.trim()

const GRADE_TO_OUTCOME: Record<'yes' | 'partial' | 'no', Outcome> = {
  yes: 'success',
  partial: 'partial',
  no: 'failure',
}

export async function handleGradeSession(db: Database, payload: GradeSessionPayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[grade_session] no local provider; skipping')
    return
  }

  const session = db.prepare(`SELECT id, project_id, summary, phase, task_id FROM sessions WHERE id = ?`).get(payload.session_id) as
    { id: string; project_id: string; summary: string | null; phase: string; task_id: string | null } | undefined
  if (!session || !session.summary || !session.task_id) {
    console.warn(`[grade_session] missing session/summary/task_id for ${payload.session_id}`)
    return
  }

  const task = db.prepare(`SELECT title, idea_file FROM tasks WHERE id = ?`).get(session.task_id) as
    { title: string; idea_file: string | null } | undefined
  if (!task) return

  // `idea_file` is dual-use: external-task sync stores the description as raw text;
  // native tasks store `file://<path>`. For native, read the file content; otherwise use the value as the goal.
  let goal = '(no description)'
  if (task.idea_file) {
    if (task.idea_file.startsWith('file://')) {
      const project = db.prepare(`SELECT path FROM projects WHERE id = ?`).get(session.project_id) as { path: string } | undefined
      if (project) {
        const filePath = task.idea_file.replace(/^file:\/\//, '')
        try {
          const fs = await import('fs')
          goal = fs.readFileSync(filePath.startsWith('/') ? filePath : `${project.path}/${filePath}`, 'utf8')
        } catch { /* file gone — keep default */ }
      }
    } else {
      goal = task.idea_file  // external-task description, already raw text
    }
  }
  const prompt = PROMPT(task.title, goal, session.phase, session.summary)

  const raw = await localComplete(provider, prompt, { maxTokens: 200, timeoutMs: 30_000 })
  const parsed = JSON.parse(raw) as { grade: 'yes' | 'partial' | 'no'; reason: string }
  if (!['yes', 'partial', 'no'].includes(parsed.grade)) {
    throw new Error(`grade_session: invalid grade '${parsed.grade}'`)
  }

  db.prepare(`UPDATE sessions SET grade = ?, grade_reason = ?, graded_at = ? WHERE id = ?`)
    .run(parsed.grade, parsed.reason, new Date().toISOString(), session.id)

  if (parsed.grade === 'no') {
    const today = new Date().toISOString().slice(0, 10)
    enqueueJob(db, 'briefing_synthesize', { scope: '__all__' }, { dedupKey: `briefing_synthesize:__all__:${today}:gradechange` })
    enqueueJob(db, 'briefing_synthesize', { scope: session.project_id }, { dedupKey: `briefing_synthesize:${session.project_id}:${today}:gradechange` })
  }

  // Update router success-rate
  const decision = db.prepare(`SELECT id FROM routing_decisions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(session.id) as { id: string } | undefined
  if (decision) {
    recordOutcome(db, { decisionId: decision.id, outcome: GRADE_TO_OUTCOME[parsed.grade] })
  }
}
