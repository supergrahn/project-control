import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { initDb, createProject } from '@/lib/db'
import Database from 'better-sqlite3'
import { upsertTaskSourceConfig } from '@/lib/db/taskSourceConfig'
import { syncProjectSource, syncProject } from '@/lib/taskSources/syncService'

let db: Database.Database
let projectId: string

beforeEach(() => {
  db = initDb(':memory:')
  projectId = createProject(db, { name: 'test', path: '/tmp/test' })
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
})

// Mock the adapter registry
vi.mock('@/lib/taskSources/adapters', () => ({
  getTaskSourceAdapter: vi.fn((key: string) => ({
    key,
    name: key,
    configFields: [],
    resourceSelectionLabel: 'Select',
    fetchAvailableResources: async () => [],
    fetchTasks: async () => [],
    mapStatus: (raw: string) => raw === 'done' ? 'done' : 'idea',
    mapPriority: () => 'medium',
  })),
}))

describe('syncProjectSource', () => {
  it('throws when no config exists for adapter', async () => {
    await expect(syncProjectSource(db, projectId, 'github')).rejects.toThrow('No config for github')
  })

  it('creates new tasks from external source', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'github',
      name: 'GitHub Issues',
      configFields: [],
      resourceSelectionLabel: 'Select repositories',
      fetchAvailableResources: async () => [],
      fetchTasks: async () => [{
        sourceId: 'owner/repo#1',
        title: 'Fix bug',
        description: 'desc',
        status: 'open',
        priority: 'high',
        url: 'https://github.com/owner/repo/issues/1',
        labels: ['bug'],
        assignees: ['alice'],
        meta: {},
      }],
      mapStatus: (raw: string) => raw === 'done' ? 'done' : 'idea',
      mapPriority: () => 'high',
    })

    const result = await syncProjectSource(db, projectId, 'github')
    expect(result.created).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.deleted).toBe(0)
    expect(result.error).toBeUndefined()

    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(projectId) as any[]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Fix bug')
    expect(tasks[0].source).toBe('github')
    expect(tasks[0].source_id).toBe('owner/repo#1')
  })

  it('updates existing tasks on re-sync', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    const mockFetchTasks = vi.fn()
      .mockResolvedValueOnce([{
        sourceId: 'owner/repo#1',
        title: 'Original title',
        description: null,
        status: 'open',
        priority: null,
        url: 'https://github.com/owner/repo/issues/1',
        labels: [],
        assignees: [],
        meta: {},
      }])
      .mockResolvedValueOnce([{
        sourceId: 'owner/repo#1',
        title: 'Updated title',
        description: null,
        status: 'open',
        priority: null,
        url: 'https://github.com/owner/repo/issues/1',
        labels: [],
        assignees: [],
        meta: {},
      }])

    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'github',
      name: 'GitHub Issues',
      configFields: [],
      resourceSelectionLabel: 'Select repositories',
      fetchAvailableResources: async () => [],
      fetchTasks: mockFetchTasks,
      mapStatus: () => 'idea',
      mapPriority: () => 'medium',
    })

    await syncProjectSource(db, projectId, 'github')
    const result2 = await syncProjectSource(db, projectId, 'github')
    expect(result2.updated).toBe(1)
    expect(result2.created).toBe(0)

    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(projectId) as any[]
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Updated title')
  })

  it('soft-deletes tasks removed from external source', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'github',
      name: 'GitHub Issues',
      configFields: [],
      resourceSelectionLabel: 'Select repositories',
      fetchAvailableResources: async () => [],
      fetchTasks: vi.fn()
        .mockResolvedValueOnce([{
          sourceId: 'owner/repo#1',
          title: 'Task',
          description: null,
          status: 'open',
          priority: null,
          url: 'https://github.com/owner/repo/issues/1',
          labels: [],
          assignees: [],
          meta: {},
        }])
        .mockResolvedValueOnce([]),
      mapStatus: () => 'idea',
      mapPriority: () => 'medium',
    })

    await syncProjectSource(db, projectId, 'github')
    const result2 = await syncProjectSource(db, projectId, 'github')
    expect(result2.deleted).toBe(1)
    // Task is soft-deleted: still exists in DB but marked is_deleted = 1
    const allTasks = db.prepare('SELECT * FROM tasks WHERE project_id = ?').all(projectId) as any[]
    expect(allTasks).toHaveLength(1)
    expect(allTasks[0].is_deleted).toBe(1)
  })

  it('rolls back all task changes if an error occurs mid-sync', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'github',
      name: 'GitHub',
      configFields: [],
      resourceSelectionLabel: 'Select',
      fetchAvailableResources: async () => [],
      fetchTasks: async () => [
        { sourceId: 'r1', title: 'Task 1', description: null, status: 'open', priority: null, url: 'u1', labels: [], assignees: [], meta: {} },
        { sourceId: 'r2', title: 'Task 2', description: null, status: 'open', priority: null, url: 'u2', labels: [], assignees: [], meta: {} },
      ],
      mapStatus: () => 'idea' as const,
      mapPriority: () => 'medium' as const,
    })

    // First sync succeeds - creates 2 tasks
    await syncProjectSource(db, projectId, 'github')
    const before = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND is_deleted = 0').get(projectId) as { n: number }
    expect(before.n).toBe(2)

    // Now break the DB mid-transaction by making updateTask throw on second call
    const original = db.prepare.bind(db)
    let callCount = 0
    vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
      if (sql.includes('UPDATE tasks SET') && ++callCount === 2) {
        throw new Error('simulated DB error')
      }
      return original(sql)
    })

    await syncProjectSource(db, projectId, 'github')

    // All tasks should still be visible — partial update rolled back
    const after = db.prepare('SELECT COUNT(*) as n FROM tasks WHERE project_id = ? AND is_deleted = 0').get(projectId) as { n: number }
    expect(after.n).toBe(2)
    const tasks = db.prepare(
      'SELECT title FROM tasks WHERE project_id = ? AND is_deleted = 0 ORDER BY title'
    ).all(projectId) as { title: string }[]
    expect(tasks.map(t => t.title)).toEqual(['Task 1', 'Task 2'])
  })

  it('returns error result and stores last_error on fetch failure', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, ['owner/repo'])

    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'github',
      name: 'GitHub Issues',
      configFields: [],
      resourceSelectionLabel: 'Select repositories',
      fetchAvailableResources: async () => [],
      fetchTasks: async () => { throw new Error('Network error') },
      mapStatus: () => 'idea',
      mapPriority: () => 'medium',
    })

    const result = await syncProjectSource(db, projectId, 'github')
    expect(result.error).toBe('Network error')
    expect(result.created).toBe(0)

    const cfg = db.prepare('SELECT last_error FROM task_source_config WHERE project_id = ? AND adapter_key = ?').get(projectId, 'github') as any
    expect(cfg.last_error).toBe('Network error')
  })
})

describe('syncProject', () => {
  it('syncs all active sources for a project', async () => {
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])

    const results = await syncProject(db, projectId)
    expect(results).toHaveLength(2)
  })

  it('skips inactive sources', async () => {
    const { toggleTaskSourceActive } = await import('@/lib/db/taskSourceConfig')
    upsertTaskSourceConfig(db, projectId, 'github', { token: 'abc' }, [])
    upsertTaskSourceConfig(db, projectId, 'jira', { base_url: 'x', email: 'y', api_token: 'z' }, [])
    toggleTaskSourceActive(db, projectId, 'jira', false)

    const results = await syncProject(db, projectId)
    expect(results).toHaveLength(1)
  })
})
