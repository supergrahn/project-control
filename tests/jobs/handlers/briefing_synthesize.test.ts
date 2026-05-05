import { describe, it, expect, vi, beforeEach } from 'vitest'

const { localCompleteMock, getDefaultLocalProviderMock } = vi.hoisted(() => ({
  localCompleteMock: vi.fn(),
  getDefaultLocalProviderMock: vi.fn(),
}))

vi.mock('@/lib/router/localComplete', () => ({
  localComplete: localCompleteMock,
  getLocalModelName: () => 'mock-model',
}))

vi.mock('@/lib/db/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/providers')>()
  return { ...actual, getDefaultLocalProvider: getDefaultLocalProviderMock }
})

import { initDb, createProject } from '@/lib/db'
import { createTask } from '@/lib/db/tasks'
import { handleBriefingSynthesize } from '@/lib/jobs/handlers/briefing_synthesize'
import { sectionSignature } from '@/lib/briefing/sectionSignature'
import { getTopTasks } from '@/lib/briefing/topTasks'

import type { Database } from 'better-sqlite3'

const FAKE_PROVIDER = { id: 'p1', name: 'mock', type: 'ollama', command: '...', config: '{}', is_active: 1, created_at: 'now' } as never

describe('handleBriefingSynthesize', () => {
  let db: ReturnType<typeof initDb>
  let projectId: string

  beforeEach(() => {
    db = initDb(':memory:')
    projectId = createProject(db, { name: 'Test', path: '/tmp' })
    localCompleteMock.mockReset()
    getDefaultLocalProviderMock.mockReset()
    getDefaultLocalProviderMock.mockReturnValue(FAKE_PROVIDER)
  })

  it('aborts when no local provider', async () => {
    getDefaultLocalProviderMock.mockReturnValue(null)
    await handleBriefingSynthesize(db, { scope: '__all__' })
    expect(localCompleteMock).not.toHaveBeenCalled()
    const rows = db.prepare(`SELECT * FROM briefing_snapshots`).all()
    expect(rows).toEqual([])
  })

  it('skips LLM when section_signature matches existing snapshot', async () => {
    // Seed a task so topTasks has content and the signature is non-trivial
    createTask(db, { id: 't1', projectId, title: 'First task' })

    // Compute the signature that the handler will compute
    const sections = {
      openNextActions: [],
      criticFlagged: [],
      topTasks: getTopTasks(db),
      recentFailures: [],
      duplicateTasks: [],
    }
    const sig = sectionSignature(sections)

    // Pre-insert a snapshot with that signature
    db.prepare(`INSERT INTO briefing_snapshots (scope_key, project_id, narrative, priority_actions, section_signature, model, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('__all__', null, 'old narrative', '[]', sig, 'old-model', new Date().toISOString())

    await handleBriefingSynthesize(db, { scope: '__all__' })
    expect(localCompleteMock).not.toHaveBeenCalled()

    // The row should not have been updated (narrative still 'old narrative')
    const row = db.prepare(`SELECT narrative FROM briefing_snapshots WHERE scope_key = '__all__'`).get() as { narrative: string }
    expect(row.narrative).toBe('old narrative')
  })

  it('stores fallback empty narrative when LLM returns unparseable JSON', async () => {
    localCompleteMock.mockResolvedValue('not json at all')
    await handleBriefingSynthesize(db, { scope: '__all__' })
    const row = db.prepare(`SELECT narrative, priority_actions, model FROM briefing_snapshots WHERE scope_key = '__all__'`).get() as any
    expect(row).not.toBeNull()
    expect(row.narrative).toBe('')
    expect(row.priority_actions).toBe('[]')
    expect(row.model).toBe('mock-model')
  })

  it('stores parsed narrative and priority_actions on successful LLM output', async () => {
    // Seed a task with status 'plan' so topTasks returns it with taskId 't1'
    createTask(db, { id: 't1', projectId, title: 'First task' })

    const llmOutput = JSON.stringify({
      narrative: 'morning brief',
      priority_actions: [{ sectionKey: 'top_tasks', refId: 't1', reason: 'high priority' }],
    })
    localCompleteMock.mockResolvedValue(llmOutput)

    await handleBriefingSynthesize(db, { scope: '__all__' })

    const row = db.prepare(`SELECT narrative, priority_actions, model, generated_at FROM briefing_snapshots WHERE scope_key = '__all__'`).get() as any
    expect(row).not.toBeNull()
    expect(row.narrative).toBe('morning brief')
    const actions = JSON.parse(row.priority_actions)
    expect(actions).toHaveLength(1)
    expect(actions[0].refId).toBe('t1')
    expect(actions[0].sectionKey).toBe('top_tasks')
    expect(row.model).toBe('mock-model')
    expect(row.generated_at).toBeTruthy()
  })

  it('filters priority_actions with unknown refId', async () => {
    // Seed task 't1' — valid refId for top_tasks
    createTask(db, { id: 't1', projectId, title: 'First task' })

    const llmOutput = JSON.stringify({
      narrative: 'morning brief',
      priority_actions: [
        { sectionKey: 'top_tasks', refId: 't1', reason: 'valid' },
        { sectionKey: 'top_tasks', refId: 'unknown-id-xyz', reason: 'invented id' },
      ],
    })
    localCompleteMock.mockResolvedValue(llmOutput)

    await handleBriefingSynthesize(db, { scope: '__all__' })

    const row = db.prepare(`SELECT priority_actions FROM briefing_snapshots WHERE scope_key = '__all__'`).get() as any
    const actions = JSON.parse(row.priority_actions)
    // Only 't1' should survive; 'unknown-id-xyz' should be dropped
    expect(actions).toHaveLength(1)
    expect(actions[0].refId).toBe('t1')
  })

  it('UPSERT replaces existing snapshot row (only one row per scope_key)', async () => {
    // First call — sections are empty (no tasks yet), returns valid LLM output
    localCompleteMock.mockResolvedValue(JSON.stringify({
      narrative: 'first narrative',
      priority_actions: [],
    }))
    await handleBriefingSynthesize(db, { scope: '__all__' })

    // Seed a new task to change the section_signature for the second call
    createTask(db, { id: 't2', projectId, title: 'Second task' })

    // Second call with different sections (different signature)
    localCompleteMock.mockResolvedValue(JSON.stringify({
      narrative: 'second narrative',
      priority_actions: [],
    }))
    await handleBriefingSynthesize(db, { scope: '__all__' })

    const rows = db.prepare(`SELECT * FROM briefing_snapshots WHERE scope_key = '__all__'`).all()
    expect(rows).toHaveLength(1)
    const row = rows[0] as any
    expect(row.narrative).toBe('second narrative')
  })
})
