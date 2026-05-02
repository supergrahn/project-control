import type { Database } from 'better-sqlite3'
import { localComplete } from '@/lib/router/localComplete'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { getTasksByProject } from '@/lib/db/tasks'
import { taskMatchesPath } from '@/lib/prep/taskMatchesPath'
import { enqueueJob } from '@/lib/jobs/runner'

export type ExtractNextActionsPayload = { session_id: string }

const PROMPT = (summary: string) => `
You are extracting structured next-steps from a coding agent's wrap-up message.
Return a JSON object with EXACTLY this shape, no preamble:

{
  "next_actions": ["short action sentence", ...],
  "open_questions": ["short question", ...],
  "files_touched": [{ "path": "<relative>", "change": "<one-line description>" }, ...]
}

Rules:
- Each next_action is one concrete step. 0-5 entries.
- Each open_question is one ambiguity. 0-3 entries.
- files_touched lists files modified or created with one-line descriptions. 0-20 entries.
- If a section has no entries, return an empty array.
- Use exact relative paths as the agent wrote them.

Agent's final summary:
${summary}
`.trim()

export async function handleExtractNextActions(db: Database, payload: ExtractNextActionsPayload): Promise<void> {
  const provider = getDefaultLocalProvider(db)
  if (!provider) {
    console.warn('[extract_next_actions] no local provider; skipping')
    return
  }

  const session = db.prepare(`SELECT id, project_id, summary FROM sessions WHERE id = ?`).get(payload.session_id) as
    { id: string; project_id: string; summary: string | null } | undefined
  if (!session || !session.summary) return

  const raw = await localComplete(provider, PROMPT(session.summary), { maxTokens: 1000, timeoutMs: 20_000 })
  const parsed = JSON.parse(raw) as {
    next_actions?: string[]
    open_questions?: string[]
    files_touched?: Array<{ path: string; change: string }>
  }
  const result = {
    next_actions: parsed.next_actions ?? [],
    open_questions: parsed.open_questions ?? [],
    files_touched: parsed.files_touched ?? [],
    extracted_at: new Date().toISOString(),
    model: 'local',
  }

  db.prepare(`UPDATE sessions SET next_actions = ? WHERE id = ?`)
    .run(JSON.stringify(result), session.id)

  // Trigger refresh_prep for matching tasks
  const tasks = getTasksByProject(db, session.project_id)
  for (const file of result.files_touched) {
    for (const t of tasks) {
      if (taskMatchesPath(t, file.path)) {
        enqueueJob(db, 'refresh_prep', { task_id: t.id }, { dedupKey: `refresh_prep:${t.id}` })
      }
    }
  }

  // Enqueue session_summary embedding
  const { createHash } = await import('crypto')
  const hash = createHash('sha256').update(session.summary).digest('hex')
  enqueueJob(db, 'embed',
    { project_id: session.project_id, kind: 'session_summary', ref: session.id, content_hash: hash },
    { dedupKey: `embed:${session.project_id}:session_summary:${session.id}` }
  )
}
