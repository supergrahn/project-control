import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb, createProject, getProject, updateProjectSettings, createSession, getActiveSessions, endSession } from '@/lib/db'
import Database from 'better-sqlite3'

let db: Database.Database

beforeEach(() => {
  db = initDb(':memory:')
})

afterEach(() => {
  db.close()
})

describe('projects', () => {
  it('creates and retrieves a project', () => {
    const id = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    const project = getProject(db, id)
    expect(project?.name).toBe('my-app')
    expect(project?.path).toBe('/home/tom/git/my-app')
    expect(project?.ideas_dir).toBeNull()
  })

  it('updates project settings', () => {
    const id = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    updateProjectSettings(db, id, { ideas_dir: 'docs/ideas', specs_dir: 'docs/specs', plans_dir: 'docs/plans' })
    const project = getProject(db, id)
    expect(project?.ideas_dir).toBe('docs/ideas')
  })
})

describe('sessions', () => {
  it('creates an active session and retrieves it', () => {
    const projectId = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    createSession(db, {
      id: 'test-uuid',
      projectId,
      label: 'AI Auth · develop',
      phase: 'develop',
      sourceFile: '/home/tom/git/my-app/docs/ideas/ai-auth.md',
    })
    const sessions = getActiveSessions(db)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].label).toBe('AI Auth · develop')
    expect(sessions[0].status).toBe('active')
  })

  it('ends a session', () => {
    const projectId = createProject(db, { name: 'my-app', path: '/home/tom/git/my-app' })
    createSession(db, { id: 'test-uuid', projectId, label: 'test', phase: 'develop', sourceFile: null })
    endSession(db, 'test-uuid')
    expect(getActiveSessions(db)).toHaveLength(0)
  })
})
