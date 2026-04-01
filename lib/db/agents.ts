import type { Database } from 'better-sqlite3'

export type AgentStatus = 'idle' | 'running' | 'paused'

export type Agent = {
  id: string
  project_id: string
  name: string
  title: string | null
  provider_id: string | null
  model: string | null
  instructions_path: string | null
  status: AgentStatus
  created_at: string
  updated_at: string
}

export type CreateAgentInput = {
  id: string
  projectId: string
  name: string
  title?: string
  providerId?: string
  model?: string
  instructionsPath: string
}

export type UpdateAgentInput = {
  name?: string
  title?: string | null
  provider_id?: string | null
  model?: string | null
  status?: AgentStatus
}

export function createAgent(db: Database, input: CreateAgentInput): Agent {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO agents (id, project_id, name, title, provider_id, model, instructions_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)
  `).run(
    input.id,
    input.projectId,
    input.name,
    input.title ?? null,
    input.providerId ?? null,
    input.model ?? null,
    input.instructionsPath,
    now,
    now,
  )
  return getAgent(db, input.id)!
}

export function getAgent(db: Database, id: string): Agent | undefined {
  return db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as Agent | undefined
}

export function getAgentsByProject(db: Database, projectId: string): Agent[] {
  return db.prepare(
    'SELECT * FROM agents WHERE project_id = ? ORDER BY created_at ASC'
  ).all(projectId) as Agent[]
}

export function updateAgent(db: Database, id: string, input: UpdateAgentInput): Agent {
  const updates: string[] = []
  const values: unknown[] = []

  if ('name' in input)        { updates.push('name = ?');         values.push(input.name) }
  if ('title' in input)       { updates.push('title = ?');        values.push(input.title) }
  if ('provider_id' in input) { updates.push('provider_id = ?');  values.push(input.provider_id) }
  if ('model' in input)       { updates.push('model = ?');        values.push(input.model) }
  if ('status' in input)      { updates.push('status = ?');       values.push(input.status) }

  if (updates.length === 0) return getAgent(db, id)!

  updates.push('updated_at = ?')
  values.push(new Date().toISOString(), id)

  db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return getAgent(db, id)!
}

export function deleteAgent(db: Database, id: string): void {
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
}
