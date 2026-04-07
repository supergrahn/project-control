import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

vi.mock('@/lib/taskSources/adapters', () => ({
  getTaskSourceAdapter: vi.fn(),
}))

import { GET } from '@/app/api/projects/[id]/external-tasks/route'
import { NextRequest } from 'next/server'
import { getDb } from '@/lib/db'
import { upsertTaskSourceConfig, toggleTaskSourceActive } from '@/lib/db/taskSourceConfig'
import { getTaskSourceAdapter } from '@/lib/taskSources/adapters'

const p = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (projectId: string) =>
  new NextRequest(`http://localhost/api/projects/${projectId}/external-tasks`)

function seedConfig(projectId: string, adapterKey: string, isActive = true) {
  const db = getDb()
  upsertTaskSourceConfig(db, projectId, adapterKey, { token: 'test-token' }, ['res-1'])
  if (!isActive) {
    toggleTaskSourceActive(db, projectId, adapterKey, false)
  }
}

beforeEach(() => {
  getDb().prepare('DELETE FROM task_source_config').run()
  vi.clearAllMocks()
})

describe('GET /api/projects/[id]/external-tasks', () => {
  it('returns empty tasks and errors when no active configs', async () => {
    const res = await GET(req('proj-1'), p('proj-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ tasks: [], errors: [] })
  })

  it('returns empty tasks and errors when configs exist but none are active', async () => {
    seedConfig('proj-inactive', 'jira', false)
    const res = await GET(req('proj-inactive'), p('proj-inactive'))
    const body = await res.json()
    expect(body).toEqual({ tasks: [], errors: [] })
  })

  it('returns mapped tasks from an active adapter', async () => {
    seedConfig('proj-2', 'jira')

    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'jira',
      name: 'Jira',
      configFields: [],
      resourceSelectionLabel: 'Projects',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([
        {
          sourceId: 'JIRA-1',
          title: 'Fix the thing',
          description: 'Some description',
          status: 'In Progress',
          priority: 'High',
          url: 'https://example.atlassian.net/browse/JIRA-1',
          labels: ['bug'],
          assignees: ['alice'],
          meta: { fields: { duedate: '2026-05-01', created: '2026-01-01', updated: '2026-02-01' } },
        },
      ]),
      mapStatus: vi.fn(),
      mapPriority: vi.fn(),
    })

    const res = await GET(req('proj-2'), p('proj-2'))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.errors).toHaveLength(0)
    expect(body.tasks).toHaveLength(1)

    const task = body.tasks[0]
    expect(task.id).toBe('JIRA-1')
    expect(task.source).toBe('jira')
    expect(task.title).toBe('Fix the thing')
    expect(task.status).toBe('inprogress')
    expect(task.rawStatus).toBe('In Progress')
    expect(task.priority).toBe('high')
    expect(task.dueDate).toBe('2026-05-01')
    expect(task.createdAt).toBe('2026-01-01')
    expect(task.updatedAt).toBe('2026-02-01')
    expect(task.labels).toEqual(['bug'])
    expect(task.assignees).toEqual(['alice'])
  })

  it('collects errors from failed adapters and continues with successful ones', async () => {
    seedConfig('proj-3', 'jira')
    seedConfig('proj-3', 'github')

    vi.mocked(getTaskSourceAdapter).mockImplementation((key: string) => {
      if (key === 'jira') {
        return {
          key: 'jira',
          name: 'Jira',
          configFields: [],
          resourceSelectionLabel: 'Projects',
          fetchAvailableResources: vi.fn(),
          fetchTasks: vi.fn().mockRejectedValue(new Error('Auth failed')),
          mapStatus: vi.fn(),
          mapPriority: vi.fn(),
        }
      }
      return {
        key: 'github',
        name: 'GitHub',
        configFields: [],
        resourceSelectionLabel: 'Repos',
        fetchAvailableResources: vi.fn(),
        fetchTasks: vi.fn().mockResolvedValue([
          {
            sourceId: 'gh-42',
            title: 'GitHub issue',
            description: null,
            status: 'todo',
            priority: null,
            url: 'https://github.com/org/repo/issues/42',
            labels: [],
            assignees: [],
            meta: {},
          },
        ]),
        mapStatus: vi.fn(),
        mapPriority: vi.fn(),
      }
    })

    const res = await GET(req('proj-3'), p('proj-3'))
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].id).toBe('gh-42')
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toBe('Jira: Auth failed')
  })

  it('maps status values correctly', async () => {
    seedConfig('proj-status', 'github')

    const statusCases = [
      { raw: 'done', expected: 'done' },
      { raw: 'In Progress', expected: 'inprogress' },
      { raw: 'indeterminate', expected: 'inprogress' },
      { raw: 'In Review', expected: 'review' },
      { raw: 'Testing', expected: 'review' },
      { raw: 'Blocked', expected: 'blocked' },
      { raw: 'open', expected: 'todo' },
      { raw: 'backlog', expected: 'todo' },
    ]

    for (const { raw, expected } of statusCases) {
      vi.mocked(getTaskSourceAdapter).mockReturnValue({
        key: 'github',
        name: 'GitHub',
        configFields: [],
        resourceSelectionLabel: 'Repos',
        fetchAvailableResources: vi.fn(),
        fetchTasks: vi.fn().mockResolvedValue([
          {
            sourceId: 'task-1',
            title: 'Test',
            description: null,
            status: raw,
            priority: null,
            url: 'https://example.com',
            labels: [],
            assignees: [],
            meta: {},
          },
        ]),
        mapStatus: vi.fn(),
        mapPriority: vi.fn(),
      })

      const res = await GET(req('proj-status'), p('proj-status'))
      const body = await res.json()
      expect(body.tasks[0].status).toBe(expected)
    }
  })

  it('maps priority values correctly', async () => {
    seedConfig('proj-priority', 'github')

    const priorityCases: Array<{ raw: string | null; expected: string | null }> = [
      { raw: null, expected: null },
      { raw: 'Highest', expected: 'critical' },
      { raw: 'Critical', expected: 'critical' },
      { raw: 'High', expected: 'high' },
      { raw: 'Medium', expected: 'medium' },
      { raw: 'Low', expected: 'low' },
      { raw: 'Lowest', expected: 'low' },
      { raw: 'unknown', expected: 'medium' },
    ]

    for (const { raw, expected } of priorityCases) {
      vi.mocked(getTaskSourceAdapter).mockReturnValue({
        key: 'github',
        name: 'GitHub',
        configFields: [],
        resourceSelectionLabel: 'Repos',
        fetchAvailableResources: vi.fn(),
        fetchTasks: vi.fn().mockResolvedValue([
          {
            sourceId: 'task-p',
            title: 'Priority test',
            description: null,
            status: 'open',
            priority: raw,
            url: 'https://example.com',
            labels: [],
            assignees: [],
            meta: {},
          },
        ]),
        mapStatus: vi.fn(),
        mapPriority: vi.fn(),
      })

      const res = await GET(req('proj-priority'), p('proj-priority'))
      const body = await res.json()
      expect(body.tasks[0].priority).toBe(expected)
    }
  })

  it('uses meta.dueDate fallback when fields.duedate is absent', async () => {
    seedConfig('proj-meta', 'monday')

    vi.mocked(getTaskSourceAdapter).mockReturnValue({
      key: 'monday',
      name: 'Monday',
      configFields: [],
      resourceSelectionLabel: 'Boards',
      fetchAvailableResources: vi.fn(),
      fetchTasks: vi.fn().mockResolvedValue([
        {
          sourceId: 'mon-1',
          title: 'Monday task',
          description: null,
          status: 'done',
          priority: null,
          url: 'https://monday.com/item/1',
          labels: [],
          assignees: [],
          meta: { dueDate: '2026-06-01', createdAt: '2026-01-01', updatedAt: '2026-03-01' },
        },
      ]),
      mapStatus: vi.fn(),
      mapPriority: vi.fn(),
    })

    const res = await GET(req('proj-meta'), p('proj-meta'))
    const body = await res.json()
    const task = body.tasks[0]
    expect(task.dueDate).toBe('2026-06-01')
    expect(task.createdAt).toBe('2026-01-01')
    expect(task.updatedAt).toBe('2026-03-01')
  })
})
