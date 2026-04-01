import type { Database } from 'better-sqlite3'

export type Skill = {
  id: string
  project_id: string
  name: string
  key: string
  file_path: string
  created_at: string
}

export type CreateSkillInput = {
  id: string
  projectId: string
  name: string
  key: string
  file_path: string
}

export function createSkill(db: Database, input: CreateSkillInput): Skill {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO skills (id, project_id, name, key, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(input.id, input.projectId, input.name, input.key, input.file_path, now)
  return getSkill(db, input.id)!
}

export function getSkill(db: Database, id: string): Skill | undefined {
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined
}

export function getSkillsByProject(db: Database, projectId: string): Skill[] {
  return db.prepare(
    'SELECT * FROM skills WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId) as Skill[]
}

export function updateSkill(db: Database, id: string, input: { name?: string }): Skill {
  const skill = getSkill(db, id)
  if (!skill) throw new Error(`Skill not found: ${id}`)
  if (input.name !== undefined) {
    db.prepare('UPDATE skills SET name = ? WHERE id = ?').run(input.name, id)
  }
  return getSkill(db, id)!
}

export function deleteSkill(db: Database, id: string): void {
  db.prepare('DELETE FROM skills WHERE id = ?').run(id)
}
