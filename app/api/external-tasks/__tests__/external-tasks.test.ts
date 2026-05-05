import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Seed the in-memory DB INSIDE the mock factory so it's available at hoist time
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  const db = actual.initDb(':memory:')
  return { ...actual, getDb: () => db }
})

// Mock the adapters module — implementation set in beforeEach
vi.mock('@/lib/taskSources/adapters', () => ({
  getTaskSourceAdapter: vi.fn(),
}))

import { GET } from '../route'

// Default fake adapter factory — used in beforeEach to reset after overrides
function makeFakeAdapter(key: string) {
  return {
    key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    fetchTasks: async () => [
      {
        sourceId: 'T-1',
        title: 'Test Task',
        description: 'A test task',
        status: 'in-progress',
        priority: 'high',
        url: 'https://example.com/T-1',
        labels: ['frontend'],
        assignees: ['alice'],
        meta: {},
      },
    ],
    mapStatus: (_s: string) => 'inprogress' as const,
    mapPriority: (_p: string) => 'high' as const,
  }
}

describe('GET /api/external-tasks', () => {
  beforeEach(async () => {
    // Reset mock implementations to defaults before each test
    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    vi.mocked(getTaskSourceAdapter).mockImplementation((key: string) => makeFakeAdapter(key) as any)

    // Clean up seeded data between tests
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    db.prepare('DELETE FROM task_source_config').run()
    db.prepare('DELETE FROM tasks').run()
    db.prepare('DELETE FROM projects').run()
  })

  it('returns empty tasks and errors when no projects exist', async () => {
    const res = await GET()
    const body = await res.json()

    expect(body).toHaveProperty('tasks')
    expect(body).toHaveProperty('errors')
    expect(body.tasks).toEqual([])
    expect(body.errors).toEqual([])
  })

  it('returns empty tasks when project has no active configs', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Project One', '/tmp/p1', now)

    const res = await GET()
    const body = await res.json()

    expect(body.tasks).toEqual([])
    expect(body.errors).toEqual([])
  })

  it('returns tasks with ownerProject when a project has one active config', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Project One', '/tmp/p1', now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'jira', '{}', '[]', 1, now)

    const res = await GET()
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].id).toBe('T-1')
    expect(body.tasks[0].ownerProject).toEqual({ id: 'p1', name: 'Project One' })
    expect(body.tasks[0].source).toBe('jira')
    expect(body.errors).toEqual([])
  })

  it('aggregates tasks across multiple projects', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Project One', '/tmp/p1', now)
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p2', 'Project Two', '/tmp/p2', now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'jira', '{}', '[]', 1, now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p2', 'github', '{}', '[]', 1, now)

    const res = await GET()
    const body = await res.json()

    expect(body.tasks).toHaveLength(2)
    const projectIds = body.tasks.map((t: any) => t.ownerProject.id)
    expect(projectIds).toContain('p1')
    expect(projectIds).toContain('p2')
    expect(body.errors).toEqual([])
  })

  it('does not include tasks from inactive configs', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Project One', '/tmp/p1', now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'jira', '{}', '[]', 0, now)  // is_active = 0

    const res = await GET()
    const body = await res.json()

    expect(body.tasks).toEqual([])
    expect(body.errors).toEqual([])
  })

  it('produces an error string when an adapter throws, but does not block other projects', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const { getTaskSourceAdapter } = await import('@/lib/taskSources/adapters')
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Failing Project', '/tmp/p1', now)
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p2', 'OK Project', '/tmp/p2', now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'jira', '{}', '[]', 1, now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p2', 'github', '{}', '[]', 1, now)

    // Make jira throw for p1, github works fine for p2
    vi.mocked(getTaskSourceAdapter).mockImplementation((key: string) => {
      if (key === 'jira') {
        return {
          key: 'jira',
          name: 'Jira',
          fetchTasks: async () => { throw new Error('Auth failed') },
          mapStatus: () => 'todo' as any,
          mapPriority: () => 'medium' as any,
        } as any
      }
      return {
        key,
        name: 'GitHub',
        fetchTasks: async () => [
          {
            sourceId: 'GH-1',
            title: 'GitHub Task',
            description: null,
            status: 'open',
            priority: null,
            url: 'https://github.com/GH-1',
            labels: [],
            assignees: [],
            meta: {},
          },
        ],
        mapStatus: () => 'todo' as any,
        mapPriority: () => 'medium' as any,
      } as any
    })

    const res = await GET()
    const body = await res.json()

    // p2's task should still be returned
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].ownerProject.id).toBe('p2')

    // p1's error should be in errors
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toContain('Failing Project')
    expect(body.errors[0]).toContain('Auth failed')
  })

  it('attaches prep_status from a synced tasks row when source:source_id matches', async () => {
    const { getDb } = await import('@/lib/db')
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
      .run('p1', 'Project One', '/tmp/p1', now)
    db.prepare(
      `INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('p1', 'jira', '{}', '[]', 1, now)

    // Seed a synced task row that matches source=jira, source_id=T-1
    db.prepare(
      `INSERT INTO tasks (id, project_id, title, status, source, source_id, prep_status, prep_notes, prepped_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('task-1', 'p1', 'Test Task', 'plan', 'jira', 'T-1', 'prepped', '{"notes":"ready"}', now, now, now)

    const res = await GET()
    const body = await res.json()

    expect(body.tasks).toHaveLength(1)
    const task = body.tasks[0]
    expect(task.id).toBe('T-1')
    expect(task.prep_status).toBe('prepped')
    expect(task.prep_notes).toBe('{"notes":"ready"}')
    expect(task.prepped_at).toBe(now)
  })
})
