import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { initDb } from '@/lib/db'
import type { Database } from 'better-sqlite3'
import { createSkill, getSkill, getSkillsByProject, updateSkill, deleteSkill } from '@/lib/db/skills'

let db: Database

function insertProject(id: string) {
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, `P-${id}`, `/tmp/${id}`, new Date().toISOString())
}

beforeEach(() => { db = initDb(':memory:') })
afterEach(() => { db.close() })

describe('createSkill', () => {
  it('inserts and returns a skill', () => {
    insertProject('p1')
    const s = createSkill(db, { id: 'sk1', projectId: 'p1', name: 'Coding Standards', key: 'coding-standards', file_path: '.skills/coding-standards.md' })
    expect(s.id).toBe('sk1')
    expect(s.name).toBe('Coding Standards')
    expect(s.key).toBe('coding-standards')
    expect(s.project_id).toBe('p1')
    expect(s.created_at).toBeTruthy()
  })

  it('throws on duplicate key within same project', () => {
    insertProject('p2')
    createSkill(db, { id: 'sk2', projectId: 'p2', name: 'A', key: 'my-key', file_path: '.skills/my-key.md' })
    expect(() =>
      createSkill(db, { id: 'sk3', projectId: 'p2', name: 'B', key: 'my-key', file_path: '.skills/my-key2.md' })
    ).toThrow()
  })
})

describe('getSkill', () => {
  it('returns undefined for unknown id', () => {
    expect(getSkill(db, 'nonexistent')).toBeUndefined()
  })

  it('returns the skill by id', () => {
    insertProject('p3')
    createSkill(db, { id: 'sk4', projectId: 'p3', name: 'Git Workflow', key: 'git-workflow', file_path: '.skills/git-workflow.md' })
    expect(getSkill(db, 'sk4')?.key).toBe('git-workflow')
  })
})

describe('getSkillsByProject', () => {
  it('returns all skills for a project ordered by created_at DESC', () => {
    insertProject('p4')
    createSkill(db, { id: 'sk5', projectId: 'p4', name: 'A', key: 'a', file_path: '.skills/a.md' })
    createSkill(db, { id: 'sk6', projectId: 'p4', name: 'B', key: 'b', file_path: '.skills/b.md' })
    expect(getSkillsByProject(db, 'p4')).toHaveLength(2)
  })

  it('returns empty array for project with no skills', () => {
    insertProject('p5')
    expect(getSkillsByProject(db, 'p5')).toEqual([])
  })
})

describe('updateSkill', () => {
  it('updates name in DB', () => {
    insertProject('p6')
    createSkill(db, { id: 'sk7', projectId: 'p6', name: 'Old Name', key: 'old', file_path: '.skills/old.md' })
    expect(updateSkill(db, 'sk7', { name: 'New Name' })?.name).toBe('New Name')
  })

  it('returns undefined for unknown id', () => {
    expect(updateSkill(db, 'no-such', { name: 'X' })).toBeUndefined()
  })
})

describe('deleteSkill', () => {
  it('removes the skill record', () => {
    insertProject('p7')
    createSkill(db, { id: 'sk8', projectId: 'p7', name: 'To Delete', key: 'del', file_path: '.skills/del.md' })
    deleteSkill(db, 'sk8')
    expect(getSkill(db, 'sk8')).toBeUndefined()
  })
})
