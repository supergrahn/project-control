import { describe, it, expect } from 'vitest'
import { getSessionOriginator } from '@/lib/sessions/originator'

const PROJECT_PATH = '/home/user/myproject'
const baseSession = { project_id: 'proj-1', source_file: null }
const tasks = [{ id: 'task-1', title: 'Build feature' }]

describe('getSessionOriginator', () => {
  it('returns kind=task with doc sub-link when both task_id and source_file are set', () => {
    const r = getSessionOriginator(
      { ...baseSession, task_id: 'task-1', source_file: '/home/user/myproject/specs/foo.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.task.label).toBe('Build feature')
    expect(r.task.href).toBe('/projects/proj-1/tasks/task-1')
    expect(r.doc).not.toBeNull()
    expect(r.doc!.label).toBe('foo.md')
    expect(r.doc!.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('returns kind=task with null doc when only task_id is set', () => {
    const r = getSessionOriginator({ ...baseSession, task_id: 'task-1' }, { tasks, projectPath: PROJECT_PATH })
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.doc).toBeNull()
  })

  it('falls back to truncated task id when task missing from lookups', () => {
    const r = getSessionOriginator({ ...baseSession, task_id: 'task-deleted-123' }, { tasks, projectPath: PROJECT_PATH })
    expect(r.kind).toBe('task')
    if (r.kind !== 'task') throw new Error('narrowing')
    expect(r.task.label).toBe('Task task-del')
  })

  it('returns kind=doc with relative-form href when only source_file set', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: '/home/user/myproject/specs/foo.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    expect(r.kind).toBe('doc')
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.label).toBe('foo.md')
    expect(r.doc.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('falls back to as-stored when projectPath is missing', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: 'specs/foo.md' },
      { tasks }
    )
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.href).toBe('/projects/proj-1/docs?file=' + encodeURIComponent('specs/foo.md'))
  })

  it('returns kind=agent when only agent_id is set', () => {
    const r = getSessionOriginator({ ...baseSession, agent_id: 'agt-1' }, { tasks })
    expect(r.kind).toBe('agent')
    if (r.kind !== 'agent') throw new Error('narrowing')
    expect(r.agent.label).toBe('Agent')
    expect(r.agent.href).toBe('/projects/proj-1/agents/agt-1')
  })

  it('returns kind=standalone when nothing is set', () => {
    const r = getSessionOriginator(baseSession, { tasks })
    expect(r.kind).toBe('standalone')
  })

  it('takes basename for doc label even with deep path', () => {
    const r = getSessionOriginator(
      { ...baseSession, source_file: '/home/user/myproject/a/b/c/deep.md' },
      { tasks, projectPath: PROJECT_PATH }
    )
    if (r.kind !== 'doc') throw new Error('narrowing')
    expect(r.doc.label).toBe('deep.md')
    expect(r.doc.href).toContain(encodeURIComponent('a/b/c/deep.md'))
  })
})
