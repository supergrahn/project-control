import type { Database } from 'better-sqlite3'

export type ProviderType = 'claude' | 'codex' | 'gemini' | 'ollama'

export type Provider = {
  id: string
  name: string
  type: ProviderType
  command: string
  config: string | null
  is_active: number
  created_at: string
}

export type CreateProviderInput = {
  id: string
  name: string
  type: ProviderType
  command: string
  config: string | null
}

export type UpdateProviderInput = {
  name?: string
  type?: ProviderType
  command?: string
  config?: string | null
}

export function createProvider(db: Database, input: CreateProviderInput): Provider {
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO providers (id, name, type, command, config, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)'
  ).run(input.id, input.name, input.type, input.command, input.config, now)
  return getProvider(db, input.id)!
}

export function getProvider(db: Database, id: string): Provider | undefined {
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
}

export function getProviders(db: Database): Provider[] {
  return db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as Provider[]
}

export function getActiveProviders(db: Database): Provider[] {
  return db.prepare('SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at ASC').all() as Provider[]
}

export function updateProvider(db: Database, id: string, input: UpdateProviderInput): Provider {
  const fields: string[] = []
  const values: unknown[] = []
  if ('name' in input)    { fields.push('name = ?');    values.push(input.name) }
  if ('type' in input)    { fields.push('type = ?');    values.push(input.type) }
  if ('command' in input) { fields.push('command = ?'); values.push(input.command) }
  if ('config' in input)  { fields.push('config = ?');  values.push(input.config) }
  if (fields.length === 0) return getProvider(db, id)!
  values.push(id)
  db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getProvider(db, id)!
}

export function deleteProvider(db: Database, id: string): void {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}

export function toggleProviderActive(db: Database, id: string): Provider {
  const p = getProvider(db, id)
  if (!p) throw new Error(`Provider ${id} not found`)
  db.prepare('UPDATE providers SET is_active = ? WHERE id = ?').run(p.is_active === 1 ? 0 : 1, id)
  return getProvider(db, id)!
}
