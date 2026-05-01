import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: vi.fn(),
}))

vi.mock('@/lib/prep/findFiles', () => ({
  findRelevantFiles: vi.fn(async () => []),
}))

import { getDb, createProject } from '@/lib/db'
import { createProvider } from '@/lib/db/providers'
import { createTask, getTask, updateTask, setTaskPrep } from '@/lib/db/tasks'
import { localComplete } from '@/lib/router/localComplete'
import { findRelevantFiles } from '@/lib/prep/findFiles'
import { prepareTask } from '@/lib/prep/prepareTask'

const lc = localComplete as unknown as ReturnType<typeof vi.fn>
const ff = findRelevantFiles as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  const db = getDb()
  db.prepare('DELETE FROM task_comments').run()
  db.prepare('DELETE FROM tasks').run()
  db.prepare('DELETE FROM providers').run()
  db.prepare('DELETE FROM projects').run()
  lc.mockReset()
  ff.mockReset()
  ff.mockResolvedValue([])
})

function setup(opts: { source?: string | null; sourceId?: string | null } = {}): { taskId: string; projectId: string } {
  const db = getDb()
  const projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
  const taskId = randomUUID()
  createTask(db, { id: taskId, projectId, title: 'Login broken' })
  updateTask(db, taskId, { idea_file: 'Customer says login fails after deploy' })
  if (opts.source !== null) {
    updateTask(db, taskId, {
      source: opts.source ?? 'jira',
      source_id: opts.sourceId ?? 'JIRA-123',
    } as any)
  }
  return { taskId, projectId }
}

describe('prepareTask', () => {
  it('writes prep_notes + status=ready + comment row on success', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue(JSON.stringify({
      summary: 'Login is broken.',
      intent: 'Likely auth callback regression.',
      open_questions: ['Which env?'],
    }))
    ff.mockResolvedValue([{ path: 'lib/auth.ts', why: 'login flow' }])

    await prepareTask(getDb(), taskId)

    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('ready')
    expect(t.prepped_at).toBeTruthy()
    const notes = JSON.parse(t.prep_notes!)
    expect(notes.summary).toBe('Login is broken.')
    expect(notes.files).toEqual([{ path: 'lib/auth.ts', why: 'login flow' }])

    const comments = getDb()
      .prepare(`SELECT author, source, task_source_id FROM task_comments WHERE task_source_id = 'JIRA-123'`)
      .all()
    expect(comments).toEqual([{ author: 'prep-bot', source: 'jira', task_source_id: 'JIRA-123' }])
  })

  it('flips to status=failed (no comment, no notes) when LLM throws', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockRejectedValue(new Error('timeout'))

    await prepareTask(getDb(), taskId)

    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('failed')
    expect(t.prep_notes).toBeNull()
    expect(t.prepped_at).toBeTruthy()

    const c = getDb().prepare(`SELECT COUNT(*) AS c FROM task_comments`).get() as { c: number }
    expect(c.c).toBe(0)
  })

  it('flips to failed on garbage JSON from LLM', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue('not valid json at all')

    await prepareTask(getDb(), taskId)

    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('failed')
    expect(t.prep_notes).toBeNull()
  })

  it('skips silently when local provider not configured', async () => {
    const { taskId } = setup()
    await prepareTask(getDb(), taskId)
    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('failed')
    expect(lc).not.toHaveBeenCalled()
  })

  it('short-circuits concurrent runs (status=prepping + recent prepped_at)', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    setTaskPrep(getDb(), taskId, { status: 'prepping', prepped_at: new Date().toISOString() })
    lc.mockResolvedValue(JSON.stringify({ summary: 's', intent: 'i', open_questions: [] }))

    await prepareTask(getDb(), taskId)

    expect(lc).not.toHaveBeenCalled()
    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('prepping')
  })

  it('overrides stale prepping status (>60s)', async () => {
    const { taskId } = setup()
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    const stale = new Date(Date.now() - 120_000).toISOString()
    setTaskPrep(getDb(), taskId, { status: 'prepping', prepped_at: stale })
    lc.mockResolvedValue(JSON.stringify({ summary: 's', intent: 'i', open_questions: [] }))

    await prepareTask(getDb(), taskId)

    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('ready')
  })

  it('skips comment insert for native (non-imported) tasks', async () => {
    const { taskId } = setup({ source: null })
    createProvider(getDb(), { id: 'p', name: 'L', type: 'ollama', command: 'ollama', config: null })
    lc.mockResolvedValue(JSON.stringify({ summary: 's', intent: 'i', open_questions: [] }))

    await prepareTask(getDb(), taskId)

    const t = getTask(getDb(), taskId)!
    expect(t.prep_status).toBe('ready')
    const c = getDb().prepare(`SELECT COUNT(*) AS c FROM task_comments`).get() as { c: number }
    expect(c.c).toBe(0)
  })
})
