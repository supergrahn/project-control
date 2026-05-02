import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { createProvider } from '@/lib/db/providers'
import { randomUUID } from 'crypto'
import { enqueueJob, runOneBatch, registerHandler, clearHandlers } from '@/lib/jobs/runner'
import { handleGradeSession } from '@/lib/jobs/handlers/grade_session'
import { handleExtractNextActions } from '@/lib/jobs/handlers/extract_next_actions'
import { handleRefreshPrep } from '@/lib/jobs/handlers/refresh_prep'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/router/localComplete', () => ({ localComplete: vi.fn(), getLocalModelName: () => 'mock-model' }))
vi.mock('@/lib/db/providers', async (orig) => {
  const actual = await orig<typeof import('@/lib/db/providers')>()
  return {
    ...actual,
    getDefaultLocalProvider: () => ({
      id: 'p',
      name: 'L',
      type: 'ollama',
      command: '',
      config: '{}',
      is_active: 1,
      created_at: '',
    }),
  }
})
vi.mock('@/lib/prep/prepareTask', () => ({ prepareTask: vi.fn(async () => undefined) }))

import { localComplete } from '@/lib/router/localComplete'
import { prepareTask } from '@/lib/prep/prepareTask'

let db: Database
let projectId: string
let taskId: string
let sessionId: string

beforeEach(() => {
  db = initDb(':memory:')
  clearHandlers()
  registerHandler('grade_session', handleGradeSession as never)
  registerHandler('extract_next_actions', handleExtractNextActions as never)
  registerHandler('refresh_prep', handleRefreshPrep as never)
  registerHandler('embed', async () => {}) // no-op for this test

  projectId = createProject(db, { name: 'P', path: '/tmp/p' })
  createProvider(db, { id: 'pick', name: 'Picked', type: 'claude', command: 'c', config: null })
  taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'Build feature' })
  db.prepare(`UPDATE tasks SET idea_file = ? WHERE id = ?`).run('lib/feature.ts', taskId)
  sessionId = randomUUID()
  db.prepare(
    `INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, status, created_at, ended_at, summary)
     VALUES (?, ?, ?, ?, ?, ?, 'ended', ?, ?, ?)`,
  ).run(
    sessionId,
    projectId,
    'L',
    'spec',
    null,
    taskId,
    new Date().toISOString(),
    new Date().toISOString(),
    'shipped feature',
  )
  db.prepare(
    `INSERT INTO routing_decisions (id, session_id, task_id, picked_provider, phase, complexity, score_breakdown, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('d1', sessionId, taskId, 'pick', 'spec', 'normal', '{}', new Date().toISOString())
  vi.mocked(localComplete).mockReset()
  vi.mocked(prepareTask).mockReset()
})

describe('end-to-end: session-end → grade + next_actions + refresh_prep', () => {
  it('drains in two scheduler ticks and matches tasks via files_touched', async () => {
    enqueueJob(db, 'grade_session', { session_id: sessionId }, { dedupKey: `grade_session:${sessionId}` })
    enqueueJob(
      db,
      'extract_next_actions',
      { session_id: sessionId },
      { dedupKey: `extract_next_actions:${sessionId}` },
    )

    // Tick 1: grader returns 'yes', extractor returns files_touched matching the task.
    // The two handlers run in parallel inside the same batch, so we dispatch by
    // prompt shape rather than relying on call order: grader prompts contain
    // "achieve the task's goal", extractor prompts contain "extracting structured".
    vi.mocked(localComplete).mockImplementation(async (_provider, prompt: string) => {
      if (prompt.includes("achieve the task's goal")) {
        return '{ "grade": "yes", "reason": "shipped" }'
      }
      return JSON.stringify({
        next_actions: ['document'],
        open_questions: [],
        files_touched: [{ path: 'lib/feature.ts', change: 'added' }],
      })
    })
    const r1 = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    // The first batch drains grade_session + extract_next_actions plus any
    // embed job(s) auto-enqueued by createTask. We only assert the two we
    // care about ran (>=2).
    expect(r1.ran).toBeGreaterThanOrEqual(2)

    // Verify session row
    const sess = db.prepare(`SELECT grade, next_actions FROM sessions WHERE id = ?`).get(sessionId) as {
      grade: string
      next_actions: string
    }
    expect(sess.grade).toBe('yes')
    expect(JSON.parse(sess.next_actions).files_touched).toHaveLength(1)

    // Verify routing_outcomes row
    const outcome = db.prepare(`SELECT outcome FROM routing_outcomes WHERE decision_id = 'd1'`).get() as {
      outcome: string
    }
    expect(outcome.outcome).toBe('success')

    // Verify refresh_prep was enqueued for the task
    const refresh = db
      .prepare(`SELECT kind, dedup_key FROM pending_jobs WHERE kind = 'refresh_prep'`)
      .get() as { kind: string; dedup_key: string }
    expect(refresh.dedup_key).toBe(`refresh_prep:${taskId}`)

    // Tick 2: drain refresh_prep
    const r2 = await runOneBatch(db, { batchSize: 4, loadAverageMax: 999 })
    expect(r2.ran).toBeGreaterThanOrEqual(1)
    expect(prepareTask).toHaveBeenCalledWith(db, taskId)
  })
})
