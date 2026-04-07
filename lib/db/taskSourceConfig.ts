import type { Database } from 'better-sqlite3'

export type TaskSourceConfig = {
  id: number
  project_id: string
  adapter_key: string
  config: Record<string, string>
  resource_ids: string[]
  is_active: boolean
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

type Row = Omit<TaskSourceConfig, 'config' | 'resource_ids' | 'is_active'> & {
  config: string
  resource_ids: string | null
  is_active: number
}

function parseRow(row: Row): TaskSourceConfig {
  return {
    ...row,
    config: JSON.parse(row.config),
    resource_ids: row.resource_ids ? JSON.parse(row.resource_ids) : [],
    is_active: row.is_active !== 0,
  }
}

export function getTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
): TaskSourceConfig | null {
  const row = db
    .prepare('SELECT * FROM task_source_config WHERE project_id = ? AND adapter_key = ?')
    .get(projectId, adapterKey) as Row | undefined
  return row ? parseRow(row) : null
}

export function listTaskSourceConfigs(
  db: Database,
  projectId: string,
): TaskSourceConfig[] {
  const rows = db
    .prepare('SELECT * FROM task_source_config WHERE project_id = ?')
    .all(projectId) as Row[]
  return rows.map(parseRow)
}

export function upsertTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
  config: Record<string, string>,
  resourceIds: string[],
): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO task_source_config (project_id, adapter_key, config, resource_ids, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(project_id, adapter_key) DO UPDATE SET
      config = excluded.config,
      resource_ids = excluded.resource_ids
  `).run(projectId, adapterKey, JSON.stringify(config), JSON.stringify(resourceIds), now)
}

export function deleteTaskSourceConfig(
  db: Database,
  projectId: string,
  adapterKey: string,
): void {
  db.prepare(
    'DELETE FROM task_source_config WHERE project_id = ? AND adapter_key = ?',
  ).run(projectId, adapterKey)
}

export function toggleTaskSourceActive(
  db: Database,
  projectId: string,
  adapterKey: string,
  isActive: boolean,
): void {
  db.prepare(
    'UPDATE task_source_config SET is_active = ? WHERE project_id = ? AND adapter_key = ?',
  ).run(isActive ? 1 : 0, projectId, adapterKey)
}

export function listActiveTaskSources(db: Database): TaskSourceConfig[] {
  const rows = db
    .prepare('SELECT * FROM task_source_config WHERE is_active = 1')
    .all() as Row[]
  return rows.map(parseRow)
}
