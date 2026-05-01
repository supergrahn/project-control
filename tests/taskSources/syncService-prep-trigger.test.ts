import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'
import type { Database } from 'better-sqlite3'

vi.mock('@/lib/prep/prepareTask', () => ({
  prepareTask: vi.fn(async () => undefined),
}))

vi.mock('@/lib/taskSources/adapters', () => ({
  getTaskSourceAdapter: vi.fn(),
}))

import { initDb, createProject } from '@/lib/db'
import { upsertTaskSourceConfig } from '@/lib/db/taskSourceConfig'
import { syncProjectSource } from '@/lib/taskSources/syncService'
import { prepareTask } from '@/lib/prep/prepareTask'
import * as adapters from '@/lib/taskSources/adapters'

const pt = prepareTask as unknown as ReturnType<typeof vi.fn>

function makeAdapter(fetchTasksImpl: () => Promise<unknown[]>) {
  return {
    key: 'jira',
    name: 'Jira',
    configFields: [],
    resourceSelectionLabel: '',
    fetchAvailableResources: vi.fn(),
    fetchTasks: vi.fn(fetchTasksImpl),
    mapStatus: () => 'idea' as const,
    mapPriority: () => 'medium' as const,
  }
}

describe('syncProjectSource — prep trigger', () => {
  let db: Database
  let projectId: string

  beforeEach(() => {
    db = initDb(':memory:')
    pt.mockReset()
    vi.mocked(adapters.getTaskSourceAdapter).mockReset()
    projectId = createProject(db, { name: 'P', path: `/tmp/p-${randomUUID()}` })
    upsertTaskSourceConfig(db, projectId, 'jira', {}, [])
  })

  afterEach(() => {
    db.close()
  })

  it('fires prepareTask after creating a new task row', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'New ticket', description: 'desc',
        url: 'http://x', status: 'open', priority: 'med',
        labels: [], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )

    await syncProjectSource(db, projectId, 'jira')

    expect(pt).toHaveBeenCalledTimes(1)
    expect(pt.mock.calls[0][0]).toBe(db)
    // Pin: the second arg must be the id of the just-created task row,
    // not some other id. Closes the gap where prep would fire for the
    // wrong task and the test would still pass on `typeof === 'string'`.
    const created = db.prepare(
      `SELECT id FROM tasks WHERE project_id = ? AND source = 'jira' AND source_id = 'JIRA-1'`,
    ).get(projectId) as { id: string }
    expect(pt.mock.calls[0][1]).toBe(created.id)
  })

  it('fires prepareTask when title changes on an existing task', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V1', description: 'd1',
        url: 'http://x', status: 'open', priority: 'med',
        labels: [], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')
    pt.mockReset()

    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V2 changed', description: 'd1',
        url: 'http://x', status: 'open', priority: 'med',
        labels: [], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')

    expect(pt).toHaveBeenCalledTimes(1)
  })

  it('fires prepareTask when description changes on an existing task', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V1', description: 'd1',
        url: 'http://x', status: 'open', priority: 'med',
        labels: [], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')
    pt.mockReset()

    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V1', description: 'd2 changed',
        url: 'http://x', status: 'open', priority: 'med',
        labels: [], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')

    expect(pt).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire prepareTask when only labels change', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V1', description: 'd1',
        url: 'http://x', status: 'open', priority: 'med',
        labels: ['a'], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')
    pt.mockReset()

    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(
      makeAdapter(async () => [{
        sourceId: 'JIRA-1', title: 'V1', description: 'd1',
        url: 'http://x', status: 'open', priority: 'med',
        labels: ['a', 'b'], assignees: [], meta: {},
      }]) as unknown as ReturnType<typeof adapters.getTaskSourceAdapter>,
    )
    await syncProjectSource(db, projectId, 'jira')

    expect(pt).not.toHaveBeenCalled()
  })
})
