import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database } from 'better-sqlite3'
import { initDb } from '../../db'
import { syncProjectSource } from '../syncService'
import * as adapters from '../adapters'

vi.mock('../adapters', () => ({ getTaskSourceAdapter: vi.fn() }))

describe('syncProjectSource — comment upsert', () => {
  let db: Database

  beforeEach(() => {
    db = initDb(':memory:')
    vi.clearAllMocks()
    // Insert a project and a task_source_config row
    db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES ('p1', 'Test', '/tmp', '2026-01-01')`).run()
    db.prepare(`
      INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
      VALUES ('p1', 'jira', '{}', '[]', 1, '2026-01-01')
    `).run()
  })
  afterEach(() => { db.close() })

  it('inserts comments from synced tasks into task_comments', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue({
      key: 'jira',
      name: 'Jira',
      configFields: [],
      resourceSelectionLabel: '',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([{
        sourceId: 'PROJ-1',
        title: 'Do thing',
        description: null,
        status: 'new',
        priority: null,
        url: 'https://test.atlassian.net/browse/PROJ-1',
        labels: [],
        assignees: [],
        meta: {},
        comments: [
          { id: 'c1', author: 'Alice', body: 'Hello', createdAt: '2026-04-01T09:00:00Z' },
        ],
      }]),
      mapStatus: () => 'idea' as const,
      mapPriority: () => 'medium' as const,
    })

    await syncProjectSource(db, 'p1', 'jira')

    const rows = db.prepare('SELECT * FROM task_comments WHERE project_id = ?').all('p1') as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].comment_id).toBe('c1')
    expect(rows[0].author).toBe('Alice')
    expect(rows[0].body).toBe('Hello')
    expect(rows[0].source).toBe('jira')
    expect(rows[0].task_source_id).toBe('PROJ-1')
  })

  it('does not fail if comments array is missing', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue({
      key: 'jira',
      name: 'Jira',
      configFields: [],
      resourceSelectionLabel: '',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([{
        sourceId: 'PROJ-2',
        title: 'Another',
        description: null,
        status: 'new',
        priority: null,
        url: 'https://test.atlassian.net/browse/PROJ-2',
        labels: [],
        assignees: [],
        meta: {},
        // no comments field
      }]),
      mapStatus: () => 'idea' as const,
      mapPriority: () => 'medium' as const,
    })

    const result = await syncProjectSource(db, 'p1', 'jira')
    expect(result).toBeDefined()
  })

  it('does not create duplicate comments on re-sync', async () => {
    const mockAdapter = {
      key: 'jira',
      name: 'Jira',
      configFields: [],
      resourceSelectionLabel: '',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([{
        sourceId: 'PROJ-1',
        title: 'Do thing',
        description: null,
        status: 'new',
        priority: null,
        url: 'https://test.atlassian.net/browse/PROJ-1',
        labels: [],
        assignees: [],
        meta: {},
        comments: [
          { id: 'c1', author: 'Alice', body: 'Hello', createdAt: '2026-04-01T09:00:00Z' },
        ],
      }]),
      mapStatus: () => 'idea' as const,
      mapPriority: () => 'medium' as const,
    }

    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(mockAdapter)
    await syncProjectSource(db, 'p1', 'jira')

    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue(mockAdapter)
    await syncProjectSource(db, 'p1', 'jira')

    const rows = db.prepare('SELECT * FROM task_comments WHERE project_id = ?').all('p1')
    expect(rows).toHaveLength(1)
  })

  it('inserts comments from multiple tasks', async () => {
    vi.mocked(adapters.getTaskSourceAdapter).mockReturnValue({
      key: 'jira',
      name: 'Jira',
      configFields: [],
      resourceSelectionLabel: '',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([
        {
          sourceId: 'PROJ-1',
          title: 'Task 1',
          description: null,
          status: 'new',
          priority: null,
          url: 'https://test.atlassian.net/browse/PROJ-1',
          labels: [],
          assignees: [],
          meta: {},
          comments: [
            { id: 'c1', author: 'Alice', body: 'First', createdAt: '2026-04-01T09:00:00Z' },
          ],
        },
        {
          sourceId: 'PROJ-2',
          title: 'Task 2',
          description: null,
          status: 'new',
          priority: null,
          url: 'https://test.atlassian.net/browse/PROJ-2',
          labels: [],
          assignees: [],
          meta: {},
          comments: [
            { id: 'c2', author: 'Bob', body: 'Second', createdAt: '2026-04-01T10:00:00Z' },
            { id: 'c3', author: 'Carol', body: 'Third', createdAt: '2026-04-01T11:00:00Z' },
          ],
        },
      ]),
      mapStatus: () => 'idea' as const,
      mapPriority: () => 'medium' as const,
    })

    await syncProjectSource(db, 'p1', 'jira')

    const rows = db.prepare('SELECT * FROM task_comments WHERE project_id = ?').all('p1')
    expect(rows).toHaveLength(3)
  })
})
