import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { getProject } from '@/lib/db'
import { getTask, setTaskPrep } from '@/lib/db/tasks'
import { getDefaultLocalProvider } from '@/lib/db/providers'
import { localComplete, getLocalModelName } from '@/lib/router/localComplete'
import { findRelevantFiles } from './findFiles'
import { renderPrepAsMarkdown } from './render'
import { PREP_PROMPT } from './prompts'
import type { PrepFileEntry, PrepNotes } from './types'

const RECENT_PREPPING_MS = 60_000

type RawPrep = {
  summary?: unknown
  intent?: unknown
  open_questions?: unknown
}

function parseRawPrep(raw: string): { summary: string; intent: string; open_questions: string[] } | null {
  try {
    const obj = JSON.parse(raw) as RawPrep
    if (typeof obj?.summary !== 'string') return null
    const summary = obj.summary.trim()
    if (!summary) return null
    const intent = typeof obj.intent === 'string' ? obj.intent.trim() : ''
    const open_questions = Array.isArray(obj.open_questions)
      ? obj.open_questions.filter((q): q is string => typeof q === 'string').map((q) => q.trim()).filter(Boolean)
      : []
    return { summary, intent, open_questions }
  } catch {
    return null
  }
}

function isRecentPrepping(task: { prep_status: string | null; prepped_at: string | null }): boolean {
  if (task.prep_status !== 'prepping' || !task.prepped_at) return false
  const ts = Date.parse(task.prepped_at)
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts < RECENT_PREPPING_MS
}

function insertPrepBotComment(
  db: Database,
  task: { project_id: string; source: string | null; source_id: string | null },
  body: string,
): void {
  if (!task.source || !task.source_id) return
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO task_comments (id, project_id, source, task_source_id, comment_id, author, body, created_at, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), task.project_id, task.source, task.source_id, `prep:${randomUUID()}`,
    'prep-bot', body, now, now,
  )
}

export async function prepareTask(db: Database, taskId: string): Promise<void> {
  const task = getTask(db, taskId)
  if (!task) return

  if (isRecentPrepping(task)) return

  const now = new Date().toISOString()
  setTaskPrep(db, taskId, { status: 'prepping', prepped_at: now })

  const local = getDefaultLocalProvider(db)
  if (!local) {
    console.warn(`prep: no default local provider configured for task ${taskId}`)
    setTaskPrep(db, taskId, { status: 'failed', prepped_at: new Date().toISOString() })
    return
  }

  const project = getProject(db, task.project_id)
  if (!project) {
    console.warn(`prep: project ${task.project_id} not found for task ${taskId}`)
    setTaskPrep(db, taskId, { status: 'failed', prepped_at: new Date().toISOString() })
    return
  }

  const description = task.idea_file ?? ''

  const prepPrompt = PREP_PROMPT.replace('{title}', task.title).replace('{description}', description)
  let mainRaw: string
  try {
    mainRaw = await localComplete(local, prepPrompt, { maxTokens: 600, timeoutMs: 12000 })
  } catch (err) {
    console.warn(`prep: localComplete failed for task ${taskId}:`, err)
    setTaskPrep(db, taskId, { status: 'failed', prepped_at: new Date().toISOString() })
    return
  }
  const mainParsed = parseRawPrep(mainRaw)
  if (!mainParsed) {
    console.warn(`prep: failed to parse LLM response as JSON for task ${taskId}; raw output:`, mainRaw.slice(0, 200))
    setTaskPrep(db, taskId, { status: 'failed', prepped_at: new Date().toISOString() })
    return
  }

  // findRelevantFiles is itself exhaustively try/catched internally — this
  // outer catch is defense-in-depth at the orchestrator boundary, currently
  // unreachable but kept so a future internal change can't crash prepareTask.
  let files: PrepFileEntry[]
  try {
    files = await findRelevantFiles(project.path, local, { title: task.title, description })
  } catch (err) {
    console.warn(`prep: findRelevantFiles failed for task ${taskId}:`, err)
    files = []
  }

  const notes: PrepNotes = {
    summary: mainParsed.summary,
    intent: mainParsed.intent,
    files,
    open_questions: mainParsed.open_questions,
    generated_at: new Date().toISOString(),
    model: getLocalModelName(local),
  }
  setTaskPrep(db, taskId, {
    status: 'ready',
    notes: JSON.stringify(notes),
    prepped_at: new Date().toISOString(),
  })

  // Note: the status flip and comment insert are intentionally not transactional.
  // A crash between them leaves prep-ready notes with no comment row — an
  // acceptable outcome (user still sees the prep panel) and preferred over
  // holding a tx across two unrelated tables. Wrap the comment insert so a
  // task_comments-level failure doesn't undo the orchestrator's success.
  try {
    insertPrepBotComment(db, task, renderPrepAsMarkdown(notes))
  } catch {
    // best-effort — status is already ready, the comment trail is nice-to-have
  }
}
