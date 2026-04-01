import type { Database } from 'better-sqlite3'

export type TaskSourceConfig = {
  project_id: string
  adapter_key: string
  config: Record<string, string>  // parsed from JSON
  is_active: number
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

// Raw row type (config is JSON string in DB)
type TaskSourceConfigRow = Omit<TaskSourceConfig, 'config'> & { config: string }

function parseRow(row: TaskSourceConfigRow): TaskSourceConfig {
  return { ...row, config: JSON.parse(row.config) }
}

export function getTaskSourceConfig(db: Database, projectId: string): TaskSourceConfig | null {
  const row = db.prepare('SELECT * FROM task_source_config WHERE project_id = ?').get(projectId) as TaskSourceConfigRow | undefined
  return row ? parseRow(row) : null
}

export function upsertTaskSourceConfig(db: Database, projectId: string, adapterKey: string, config: Record<string, string>): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO task_source_config (project_id, adapter_key, config, is_active, created_at)
    VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(project_id) DO UPDATE SET adapter_key = excluded.adapter_key, config = excluded.config
  `).run(projectId, adapterKey, JSON.stringify(config), now)
}

export function deleteTaskSourceConfig(db: Database, projectId: string): void {
  db.prepare('DELETE FROM task_source_config WHERE project_id = ?').run(projectId)
}

export function toggleTaskSourceActive(db: Database, projectId: string, isActive: boolean): void {
  db.prepare('UPDATE task_source_config SET is_active = ? WHERE project_id = ?').run(isActive ? 1 : 0, projectId)
}

export function listActiveTaskSources(db: Database): TaskSourceConfig[] {
  const rows = db.prepare('SELECT * FROM task_source_config WHERE is_active = 1').all() as TaskSourceConfigRow[]
  return rows.map(parseRow)
}
