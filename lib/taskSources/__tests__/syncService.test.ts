import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Database } from 'better-sqlite3'
import { initDb, _resetDbSingleton, createProject } from '@/lib/db'
import { syncProject } from '@/lib/taskSources/syncService'
import { upsertTaskSourceConfig, getTaskSourceConfig } from '@/lib/db/taskSourceConfig'
import { getTasksByProject, getTask } from '@/lib/db/tasks'
import type { ExternalTask } from '@/lib/taskSources/adapters/types'

// Mock the adapter registry
vi.mock('@/lib/taskSources/adapters', () => ({
  getTaskSourceAdapter: vi.fn()
}))

import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

// Helper to create a mock adapter
function createMockAdapter(tasks: ExternalTask[]) {
  return {
    key: 'test',
    name: 'Test',
    configFields: [],
    fetchTasks: vi.fn().mockResolvedValue(tasks),
    mapStatus: vi.fn((raw: string) => {
      if (raw === 'done') return 'done'
      if (raw === 'active') return 'developing'
      return 'idea'
    }),
    mapPriority: vi.fn((raw: string | null) => {
      if (raw === 'high') return 'high'
      return 'medium'
    }),
  }
}

describe('syncService', () => {
  let db: Database
  let projectId: string

  beforeEach(() => {
    _resetDbSingleton()
    db = initDb(':memory:')
    projectId = createProject(db, { name: 'Test Project', path: '/test/project' })
  })

  afterEach(() => {
    db.close()
    _resetDbSingleton()
  })

  it('throws when no config exists', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    await expect(syncProject(db, projectId)).rejects.toThrow(
      `No task source configured for project ${projectId}`
    )
  })

  it('creates new tasks from external source', async () => {
    const externalTasks: ExternalTask[] = [
      {
        sourceId: 'ext-1',
        title: 'Task 1',
        description: 'Description 1',
        status: 'active',
        priority: 'high',
        url: 'https://example.com/1',
        labels: ['bug', 'urgent'],
        assignees: [],
        meta: { key: 'value1' },
      },
      {
        sourceId: 'ext-2',
        title: 'Task 2',
        description: null,
        status: 'done',
        priority: null,
        url: 'https://example.com/2',
        labels: [],
        assignees: [],
        meta: { key: 'value2' },
      },
    ]

    const mockAdapter = createMockAdapter(externalTasks)
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    const result = await syncProject(db, projectId)

    expect(result.created).toBe(2)
    expect(result.updated).toBe(0)
    expect(result.deleted).toBe(0)
    expect(result.error).toBeUndefined()

    const tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(2)

    const task1 = tasks.find(t => t.source_id === 'ext-1')!
    expect(task1.title).toBe('Task 1')
    expect(task1.status).toBe('developing')
    expect(task1.priority).toBe('high')
    expect(JSON.parse(task1.labels!)).toEqual(['bug', 'urgent'])
    expect(task1.idea_file).toBe('Description 1')
    expect(task1.source_url).toBe('https://example.com/1')
    expect(task1.source).toBe('test')

    const task2 = tasks.find(t => t.source_id === 'ext-2')!
    expect(task2.title).toBe('Task 2')
    expect(task2.status).toBe('done')
    expect(task2.priority).toBe('medium')
    expect(task2.labels).toBeNull()
    expect(task2.idea_file).toBeNull()
  })

  it('updates existing tasks on re-sync', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    // First sync with 1 task
    const task1: ExternalTask = {
      sourceId: 'ext-1',
      title: 'Original Title',
      description: 'Original Desc',
      status: 'active',
      priority: 'high',
      url: 'https://example.com/1',
      labels: ['label1'],
      assignees: [],
      meta: { meta1: 'value1' },
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([task1])

    await syncProject(db, projectId)

    let tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(1)
    const createdTaskId = tasks[0].id

    // Second sync with updated data
    const task1Updated: ExternalTask = {
      ...task1,
      title: 'Updated Title',
      description: 'Updated Desc',
      status: 'done',
      priority: null,
      labels: ['label2', 'label3'],
      meta: { meta1: 'updated' },
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([task1Updated])

    const result = await syncProject(db, projectId)

    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.deleted).toBe(0)

    tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(1)

    const updated = tasks[0]
    expect(updated.id).toBe(createdTaskId)
    expect(updated.title).toBe('Updated Title')
    expect(updated.status).toBe('done')
    expect(updated.priority).toBe('medium')
    expect(JSON.parse(updated.labels!)).toEqual(['label2', 'label3'])
    expect(updated.idea_file).toBe('Updated Desc')
  })

  it('deletes tasks removed from source', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    // First sync with 2 tasks
    const task1: ExternalTask = {
      sourceId: 'ext-1',
      title: 'Task 1',
      description: null,
      status: 'active',
      priority: null,
      url: 'https://example.com/1',
      labels: [],
      assignees: [],
      meta: {},
    }

    const task2: ExternalTask = {
      sourceId: 'ext-2',
      title: 'Task 2',
      description: null,
      status: 'active',
      priority: null,
      url: 'https://example.com/2',
      labels: [],
      assignees: [],
      meta: {},
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([task1, task2])
    await syncProject(db, projectId)

    let tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(2)

    // Second sync with only task 1
    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([task1])

    const result = await syncProject(db, projectId)

    expect(result.created).toBe(0)
    expect(result.updated).toBe(1)
    expect(result.deleted).toBe(1)

    tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].source_id).toBe('ext-1')
  })

  it('sets status via setTaskStatus allowing backward transitions', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    // Create a task with final status
    const externalTask: ExternalTask = {
      sourceId: 'ext-1',
      title: 'Task',
      description: null,
      status: 'done',
      priority: null,
      url: 'https://example.com/1',
      labels: [],
      assignees: [],
      meta: {},
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([externalTask])
    await syncProject(db, projectId)

    let tasks = getTasksByProject(db, projectId)
    expect(tasks[0].status).toBe('done')

    // Re-sync with earlier status (backward transition)
    const taskUpdated: ExternalTask = {
      ...externalTask,
      status: 'active',
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([taskUpdated])
    const result = await syncProject(db, projectId)

    expect(result.updated).toBe(1)

    tasks = getTasksByProject(db, projectId)
    // setTaskStatus allows backward transitions
    expect(tasks[0].status).toBe('developing')
  })

  it('does NOT overwrite local-only fields', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    // Create task
    const externalTask: ExternalTask = {
      sourceId: 'ext-1',
      title: 'Task',
      description: 'Source description',
      status: 'active',
      priority: 'high',
      url: 'https://example.com/1',
      labels: [],
      assignees: [],
      meta: {},
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([externalTask])
    await syncProject(db, projectId)

    const tasks = getTasksByProject(db, projectId)
    const taskId = tasks[0].id

    // Manually add local-only fields
    const db_internal = db as any
    const now = new Date().toISOString()
    db_internal.prepare(`
      UPDATE tasks
      SET spec_file = ?, plan_file = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run('/path/to/spec', '/path/to/plan', 'Some local notes', now, taskId)

    // Re-sync with same task
    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([externalTask])
    await syncProject(db, projectId)

    // Verify local-only fields are preserved
    const updated = getTask(db, taskId)!
    expect(updated.spec_file).toBe('/path/to/spec')
    expect(updated.plan_file).toBe('/path/to/plan')
    expect(updated.notes).toBe('Some local notes')
    // But source fields are still updated
    expect(updated.idea_file).toBe('Source description')
    expect(updated.priority).toBe('high')
  })

  it('records error on failure', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    const errorMsg = 'Connection timeout'
    mockAdapter.fetchTasks = vi.fn().mockRejectedValue(new Error(errorMsg))

    const result = await syncProject(db, projectId)

    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.deleted).toBe(0)
    expect(result.error).toBe(errorMsg)

    const config = getTaskSourceConfig(db, projectId)
    expect(config?.last_error).toBe(errorMsg)
  })

  it('clears error on successful sync', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    // First sync fails
    mockAdapter.fetchTasks = vi.fn().mockRejectedValue(new Error('Network error'))
    await syncProject(db, projectId)

    let config = getTaskSourceConfig(db, projectId)
    expect(config?.last_error).toBe('Network error')

    // Second sync succeeds
    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([])
    const result = await syncProject(db, projectId)

    expect(result.error).toBeUndefined()

    config = getTaskSourceConfig(db, projectId)
    expect(config?.last_error).toBeNull()
  })

  it('updates last_synced_at on success', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    let config = getTaskSourceConfig(db, projectId)
    expect(config?.last_synced_at).toBeNull()

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([])
    const before = new Date()
    await syncProject(db, projectId)
    const after = new Date()

    config = getTaskSourceConfig(db, projectId)
    expect(config?.last_synced_at).not.toBeNull()

    const syncTime = new Date(config!.last_synced_at!)
    expect(syncTime.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(syncTime.getTime()).toBeLessThanOrEqual(after.getTime() + 1000) // +1s buffer
  })

  it('does not update last_synced_at on failure', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    let config = getTaskSourceConfig(db, projectId)
    const initialSyncTime = config?.last_synced_at

    mockAdapter.fetchTasks = vi.fn().mockRejectedValue(new Error('Failed'))
    await syncProject(db, projectId)

    config = getTaskSourceConfig(db, projectId)
    expect(config?.last_synced_at).toBe(initialSyncTime)
  })

  it('handles empty external task list', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    upsertTaskSourceConfig(db, projectId, 'test', {})

    const result = await syncProject(db, projectId)

    expect(result.created).toBe(0)
    expect(result.updated).toBe(0)
    expect(result.deleted).toBe(0)

    const tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(0)
  })

  it('only syncs tasks for the configured source', async () => {
    const mockAdapter = createMockAdapter([])
    vi.mocked(getTaskSourceAdapter).mockReturnValue(mockAdapter as any)

    // Configure for 'test' adapter
    upsertTaskSourceConfig(db, projectId, 'test', {})

    // Create a task manually with a different source
    const db_internal = db as any
    const now = new Date().toISOString()
    db_internal.prepare(`
      INSERT INTO tasks (id, project_id, title, status, priority, source, source_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'manual-task',
      projectId,
      'Manual Task',
      'idea',
      'medium',
      'other',
      'other-1',
      now,
      now
    )

    // Sync with the test adapter
    const externalTask: ExternalTask = {
      sourceId: 'ext-1',
      title: 'External Task',
      description: null,
      status: 'active',
      priority: null,
      url: 'https://example.com/1',
      labels: [],
      assignees: [],
      meta: {},
    }

    mockAdapter.fetchTasks = vi.fn().mockResolvedValue([externalTask])
    await syncProject(db, projectId)

    const tasks = getTasksByProject(db, projectId)
    expect(tasks).toHaveLength(2)

    // Both tasks should exist
    const externalTaskObj = tasks.find(t => t.source_id === 'ext-1')
    const manualTaskObj = tasks.find(t => t.source_id === 'other-1')

    expect(externalTaskObj).toBeDefined()
    expect(manualTaskObj).toBeDefined()
  })
})
