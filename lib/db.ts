import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import os from 'os'
import type {
  Orchestrator, OrchestratorStatus,
  OrchestratorDecision, DecisionSeverity,
  SessionProposedAction, AutomationLevel,
} from './orchestrator-types'

// Re-export types for convenience
export type { Orchestrator, OrchestratorDecision, SessionProposedAction, AutomationLevel, DecisionSeverity }

export type SessionStatus = 'active' | 'ended' | 'paused'
export type SessionPhase = 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review' | 'orchestrator'

export type Project = {
  id: string
  name: string
  path: string
  ideas_dir: string | null
  specs_dir: string | null
  plans_dir: string | null
  created_at: string
  last_used_at: string | null
  automation_level: AutomationLevel
  provider_id: string | null
}

export type Session = {
  id: string
  project_id: string
  label: string
  phase: SessionPhase
  source_file: string | null
  status: SessionStatus
  created_at: string
  ended_at: string | null
  agent_id: string | null
  exit_reason: string | null
}

const DB_PATH = path.join(process.cwd(), 'data', 'project-control.db')

export function initDb(dbPath = DB_PATH): Database.Database {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      path       TEXT UNIQUE NOT NULL,
      ideas_dir  TEXT,
      specs_dir  TEXT,
      plans_dir  TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      phase       TEXT NOT NULL,
      source_file TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL,
      ended_at    TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
  // Migrations
  try { db.exec(`ALTER TABLE sessions ADD COLUMN ended_at TEXT`) } catch {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN last_used_at TEXT`) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         TEXT PRIMARY KEY,
      project_id TEXT,
      type       TEXT NOT NULL,
      summary    TEXT NOT NULL,
      detail     TEXT,
      severity   TEXT NOT NULL DEFAULT 'info',
      created_at TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN progress_steps TEXT`) } catch {}
  try { db.exec(`ALTER TABLE projects ADD COLUMN automation_level TEXT NOT NULL DEFAULT 'checkpoint'`) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrators (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      ended_at   TEXT
    )
  `) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_decisions (
      id              TEXT PRIMARY KEY,
      orchestrator_id TEXT NOT NULL,
      project_id      TEXT NOT NULL,
      source_file     TEXT,
      summary         TEXT NOT NULL,
      detail          TEXT,
      severity        TEXT NOT NULL DEFAULT 'info',
      created_at      TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS session_proposed_actions (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      label       TEXT NOT NULL,
      action_type TEXT NOT NULL,
      payload     TEXT,
      created_at  TEXT NOT NULL,
      dismissed   INTEGER NOT NULL DEFAULT 0
    )
  `) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS feature_notes (file_path TEXT PRIMARY KEY, note TEXT NOT NULL, updated_at TEXT NOT NULL)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  project_id, project_name, file_path, file_type, title, content, tokenize='porter'
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  tags TEXT,
  created_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  tags TEXT,
  created_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dirs TEXT NOT NULL,
  created_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS feature_deps (
  id TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL,
  depends_on_key TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS notifications_read (
  event_id TEXT PRIMARY KEY,
  read_at TEXT NOT NULL
)`) } catch {}
  try { db.exec(`CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  items TEXT NOT NULL,
  created_at TEXT NOT NULL
)`) } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id),
        title       TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'idea',
        idea_file   TEXT,
        spec_file   TEXT,
        plan_file   TEXT,
        dev_summary TEXT,
        commit_refs TEXT,
        doc_refs    TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )
    `)
  } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL,
        command    TEXT NOT NULL,
        config     TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `)
  } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN task_id TEXT REFERENCES tasks(id)') } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN output_path TEXT') } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN exit_reason TEXT') } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id               TEXT PRIMARY KEY,
        project_id       TEXT NOT NULL REFERENCES projects(id),
        name             TEXT NOT NULL,
        title            TEXT,
        provider_id      TEXT,
        model            TEXT,
        instructions_path TEXT,
        status           TEXT NOT NULL DEFAULT 'idle',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      )
    `)
  } catch {}
  try { db.exec('ALTER TABLE sessions ADD COLUMN agent_id TEXT') } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN labels TEXT`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN assignee_agent_id TEXT`) } catch {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL,
        command    TEXT NOT NULL,
        config     TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `)
  } catch {}
  try { db.exec('ALTER TABLE projects ADD COLUMN provider_id TEXT') } catch {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN provider_id TEXT') } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      name       TEXT NOT NULL,
      key        TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(project_id, key)
    )
  `) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS session_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      type       TEXT NOT NULL,
      role       TEXT,
      content    TEXT,
      metadata   TEXT,
      created_at TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec('ALTER TABLE tasks ADD COLUMN session_log TEXT') } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id)') } catch {}
  // ── External Task Sources ──────────────────────────────────────────────────
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS task_source_config (
      project_id   TEXT PRIMARY KEY REFERENCES projects(id),
      adapter_key  TEXT NOT NULL,
      config       TEXT NOT NULL DEFAULT '{}',
      is_active    INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      last_error     TEXT,
      created_at   TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN source TEXT`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN source_id TEXT`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN source_url TEXT`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN source_meta TEXT`) } catch {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source ON tasks(project_id, source, source_id) WHERE source IS NOT NULL`) } catch {}
  // ── Multi-source migration: recreate task_source_config with composite key ──
  try {
    const cols = db.prepare(`PRAGMA table_info(task_source_config)`).all() as { name: string }[]
    const hasIdColumn = cols.some(c => c.name === 'id')
    if (cols.length > 0 && !hasIdColumn) {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE task_source_config_new (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    TEXT NOT NULL,
            adapter_key   TEXT NOT NULL,
            config        TEXT NOT NULL DEFAULT '{}',
            resource_ids  TEXT,
            is_active     INTEGER NOT NULL DEFAULT 1,
            last_synced_at TEXT,
            last_error    TEXT,
            created_at    TEXT NOT NULL,
            UNIQUE(project_id, adapter_key)
          )
        `)
        db.exec(`
          INSERT INTO task_source_config_new
            (project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at)
            SELECT project_id, adapter_key, config, is_active, last_synced_at, last_error, created_at
            FROM task_source_config
        `)
        db.exec(`DROP TABLE task_source_config`)
        db.exec(`ALTER TABLE task_source_config_new RENAME TO task_source_config`)
      })()
    }
  } catch (err) {
    console.error('[db migration] task_source_config multi-source migration failed:', err)
  }
  // Migrate existing file paths to file:// prefix
  try {
    for (const col of ['idea_file', 'spec_file', 'plan_file']) {
      db.exec(`UPDATE tasks SET ${col} = 'file://' || ${col} WHERE ${col} IS NOT NULL AND ${col} NOT LIKE 'file://%'`)
    }
  } catch {}
  // ── Task Flow: Status Audit Log & Dependencies ──────────────────────────
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS task_status_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'user',
      reason TEXT,
      created_at TEXT NOT NULL
    )
  `) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_task_status_log_task_id ON task_status_log(task_id)`) } catch {}
  try { db.exec(`
    CREATE TABLE IF NOT EXISTS task_dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      depends_on_id TEXT NOT NULL REFERENCES tasks(id),
      created_at TEXT NOT NULL,
      UNIQUE(task_id, depends_on_id)
    )
  `) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id)`) } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_id)`) } catch {}
  // Seed default global settings on first run
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('git_root', ?)`)
    .run(path.join(os.homedir(), 'git'))
  return db
}

export function getGlobalSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setGlobalSetting(db: Database.Database, key: string, value: string | null): void {
  if (value === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  } else {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }
}

export function getAllGlobalSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function createProject(db: Database.Database, data: { name: string; path: string }): string {
  const id = randomUUID()
  db.prepare(`INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, data.name, data.path, new Date().toISOString())
  return id
}

export function getProject(db: Database.Database, id: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project | undefined
}

export function listProjects(db: Database.Database): Project[] {
  return db.prepare(`SELECT * FROM projects ORDER BY last_used_at DESC, created_at DESC`).all() as Project[]
}

export function touchProject(db: Database.Database, id: string): void {
  db.prepare(`UPDATE projects SET last_used_at = ? WHERE id = ?`).run(new Date().toISOString(), id)
}

export function getProjectByPath(db: Database.Database, projectPath: string): Project | undefined {
  return db.prepare(`SELECT * FROM projects WHERE path = ?`).get(projectPath) as Project | undefined
}

export function updateProjectSettings(
  db: Database.Database,
  id: string,
  settings: { ideas_dir?: string | null; specs_dir?: string | null; plans_dir?: string | null }
): void {
  const fields: string[] = []
  const values: (string | null)[] = []
  if ('ideas_dir' in settings) { fields.push('ideas_dir = ?'); values.push(settings.ideas_dir ?? null) }
  if ('specs_dir' in settings) { fields.push('specs_dir = ?'); values.push(settings.specs_dir ?? null) }
  if ('plans_dir' in settings) { fields.push('plans_dir = ?'); values.push(settings.plans_dir ?? null) }
  if (fields.length === 0) return
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
}

export function createSession(db: Database.Database, data: {
  id: string
  projectId: string
  label: string
  phase: SessionPhase
  sourceFile: string | null
  taskId?: string
  outputPath?: string
  agentId?: string
}): void {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, task_id, output_path, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(data.id, data.projectId, data.label, data.phase, data.sourceFile, data.taskId ?? null, data.outputPath ?? null, data.agentId ?? null, new Date().toISOString())
}

export function getActiveSessions(db: Database.Database): Session[] {
  return db.prepare(`SELECT * FROM sessions WHERE status = 'active' ORDER BY created_at DESC`).all() as Session[]
}

export function getActiveSessionForFile(db: Database.Database, sourceFile: string): Session | undefined {
  return db.prepare(`SELECT * FROM sessions WHERE source_file = ? AND status = 'active'`).get(sourceFile) as Session | undefined
}

export function endSession(db: Database.Database, id: string): void {
  db.prepare(`UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), id)
}

export function getAllSessions(db: Database.Database, projectId?: string): Session[] {
  if (projectId) {
    return db.prepare(`SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC`).all(projectId) as Session[]
  }
  return db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as Session[]
}

// ── Orchestrators ─────────────────────────────────────────────────────────────

export function createOrchestrator(db: Database.Database, o: Orchestrator): void {
  db.prepare(`INSERT INTO orchestrators (id, project_id, session_id, status, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(o.id, o.project_id, o.session_id, o.status, o.created_at, o.ended_at)
}

export function getOrchestratorById(db: Database.Database, id: string): Orchestrator | undefined {
  return db.prepare('SELECT * FROM orchestrators WHERE id = ?').get(id) as Orchestrator | undefined
}

export function getOrchestratorByProject(db: Database.Database, projectId: string): Orchestrator | undefined {
  return db.prepare(`SELECT * FROM orchestrators WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .get(projectId) as Orchestrator | undefined
}

export function updateOrchestratorStatus(db: Database.Database, id: string, status: OrchestratorStatus): void {
  const ended_at = status === 'ended' ? new Date().toISOString() : null
  db.prepare('UPDATE orchestrators SET status = ?, ended_at = ? WHERE id = ?').run(status, ended_at, id)
}

export function listOrchestrators(db: Database.Database): Orchestrator[] {
  return db.prepare('SELECT * FROM orchestrators ORDER BY created_at DESC').all() as Orchestrator[]
}

// ── Orchestrator Decisions ────────────────────────────────────────────────────

export function createDecision(db: Database.Database, d: OrchestratorDecision): void {
  db.prepare(`INSERT INTO orchestrator_decisions (id, orchestrator_id, project_id, source_file, summary, detail, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(d.id, d.orchestrator_id, d.project_id, d.source_file, d.summary, d.detail, d.severity, d.created_at)
}

export function listDecisions(db: Database.Database, opts: {
  projectId?: string
  severity?: DecisionSeverity
  limit?: number
  offset?: number
} = {}): OrchestratorDecision[] {
  const { projectId, severity, limit = 20, offset = 0 } = opts
  const conditions: string[] = []
  const params: unknown[] = []
  if (projectId) { conditions.push('project_id = ?'); params.push(projectId) }
  if (severity) { conditions.push('severity = ?'); params.push(severity) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)
  return db.prepare(`SELECT * FROM orchestrator_decisions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params) as OrchestratorDecision[]
}

// ── Session Proposed Actions ──────────────────────────────────────────────────

export function createProposedAction(db: Database.Database, a: SessionProposedAction): void {
  db.prepare(`INSERT INTO session_proposed_actions (id, session_id, label, action_type, payload, created_at, dismissed) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(a.id, a.session_id, a.label, a.action_type, a.payload, a.created_at, a.dismissed)
}

export function getProposedActionsForSession(db: Database.Database, sessionId: string): SessionProposedAction[] {
  return db.prepare(`SELECT * FROM session_proposed_actions WHERE session_id = ? AND dismissed = 0 ORDER BY created_at ASC`)
    .all(sessionId) as SessionProposedAction[]
}

export function dismissProposedAction(db: Database.Database, id: string): void {
  db.prepare('UPDATE session_proposed_actions SET dismissed = 1 WHERE id = ?').run(id)
}

export function deleteProposedAction(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM session_proposed_actions WHERE id = ?').run(id)
}

// ── Session progress_steps ────────────────────────────────────────────────────

export function updateSessionProgressSteps(db: Database.Database, sessionId: string, stepsJson: string): void {
  db.prepare('UPDATE sessions SET progress_steps = ? WHERE id = ?').run(stepsJson, sessionId)
}

// ── Project automation_level ─────────────────────────────────────────────────

export function updateProjectAutomationLevel(db: Database.Database, projectId: string, level: AutomationLevel): void {
  db.prepare('UPDATE projects SET automation_level = ? WHERE id = ?').run(level, projectId)
}

export function getProjectAutomationLevel(db: Database.Database, projectId: string): AutomationLevel {
  const row = db.prepare('SELECT automation_level FROM projects WHERE id = ?').get(projectId) as { automation_level: AutomationLevel } | undefined
  return row?.automation_level ?? 'checkpoint'
}

// ── Context Packs ────────────────────────────────────────────────────────────

export function listContextPacks(db: Database.Database, projectId: string): Array<{ id: string; project_id: string; title: string; content: string; source_url: string | null; created_at: string; updated_at: string }> {
  return db.prepare('SELECT * FROM context_packs WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as any[]
}

export function createContextPack(db: Database.Database, data: { id: string; project_id: string; title: string; content: string; source_url?: string }): void {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO context_packs (id, project_id, title, content, source_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(data.id, data.project_id, data.title, data.content, data.source_url ?? null, now, now)
}

export function updateContextPack(db: Database.Database, id: string, data: { title?: string; content?: string }): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content) }
  fields.push('updated_at = ?'); values.push(new Date().toISOString())
  values.push(id)
  db.prepare(`UPDATE context_packs SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteContextPack(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM context_packs WHERE id = ?').run(id)
}

// ── Insights ──────────────────────────────────────────────────────────────────

export type Insight = {
  id: string
  project_id: string
  session_id: string | null
  category: string
  title: string
  detail: string
  tags: string | null
  created_at: string
}

export function createInsight(db: Database.Database, data: Insight): void {
  db.prepare('INSERT INTO insights (id, project_id, session_id, category, title, detail, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(data.id, data.project_id, data.session_id, data.category, data.title, data.detail, data.tags, data.created_at)
}

export function listInsights(db: Database.Database, projectId?: string, limit: number = 50): Insight[] {
  if (projectId) {
    return db.prepare('SELECT * FROM insights WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit) as Insight[]
  }
  return db.prepare('SELECT * FROM insights ORDER BY created_at DESC LIMIT ?').all(limit) as Insight[]
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export function listBookmarks(db: Database.Database, projectId?: string): Array<{ id: string; project_id: string | null; title: string; content: string; source_url: string | null; tags: string | null; created_at: string }> {
  if (projectId) return db.prepare('SELECT * FROM bookmarks WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[]
  return db.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC').all() as any[]
}

export function createBookmark(db: Database.Database, data: { id: string; project_id?: string | null; title: string; content: string; source_url?: string; tags?: string }): void {
  db.prepare('INSERT INTO bookmarks (id, project_id, title, content, source_url, tags, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(data.id, data.project_id ?? null, data.title, data.content, data.source_url ?? null, data.tags ?? null, new Date().toISOString())
}

export function deleteBookmark(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM bookmarks WHERE id = ?').run(id)
}

// ── Templates ─────────────────────────────────────────────────────────────────

export type Template = { id: string; name: string; description: string | null; dirs: string; created_at: string }

export function listTemplates(db: Database.Database): Template[] {
  return db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all() as Template[]
}

export function createTemplate(db: Database.Database, data: { id: string; name: string; description?: string; dirs: string }): void {
  db.prepare('INSERT INTO templates (id, name, description, dirs, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(data.id, data.name, data.description ?? null, data.dirs, new Date().toISOString())
}

export function deleteTemplate(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM templates WHERE id = ?').run(id)
}

// ── Feature Dependencies ──────────────────────────────────────────────────────

export type FeatureDep = { id: string; feature_key: string; depends_on_key: string; project_id: string; created_at: string }

export function listFeatureDeps(db: Database.Database, projectId: string): FeatureDep[] {
  return db.prepare('SELECT * FROM feature_deps WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as FeatureDep[]
}

export function createFeatureDep(db: Database.Database, data: { id: string; feature_key: string; depends_on_key: string; project_id: string }): void {
  db.prepare('INSERT INTO feature_deps (id, feature_key, depends_on_key, project_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(data.id, data.feature_key, data.depends_on_key, data.project_id, new Date().toISOString())
}

export function deleteFeatureDep(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM feature_deps WHERE id = ?').run(id)
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function getUnreadEventCount(db: Database.Database): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM events
    WHERE severity IN ('warn', 'error')
    AND id NOT IN (SELECT event_id FROM notifications_read)
    AND created_at > datetime('now', '-7 days')
  `).get() as { count: number }
  return row.count
}

export function getUnreadEvents(db: Database.Database, limit: number = 10): Array<{ id: string; projectId: string | null; type: string; summary: string; detail: string | null; severity: string; createdAt: string }> {
  return db.prepare(`
    SELECT e.id, e.project_id as projectId, e.type, e.summary, e.detail, e.severity, e.created_at as createdAt
    FROM events e
    WHERE e.severity IN ('warn', 'error')
    AND e.id NOT IN (SELECT event_id FROM notifications_read)
    AND e.created_at > datetime('now', '-7 days')
    ORDER BY e.created_at DESC LIMIT ?
  `).all(limit) as Array<{ id: string; projectId: string | null; type: string; summary: string; detail: string | null; severity: string; createdAt: string }>
}

export function markNotificationRead(db: Database.Database, eventId: string): void {
  db.prepare('INSERT OR IGNORE INTO notifications_read (event_id, read_at) VALUES (?, ?)').run(eventId, new Date().toISOString())
}

export function markAllNotificationsRead(db: Database.Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO notifications_read (event_id, read_at)
    SELECT id, ? FROM events WHERE severity IN ('warn', 'error') AND created_at > datetime('now', '-7 days')
  `).run(new Date().toISOString())
}

// ── Daily Plans ──────────────────────────────────────────────────────────────

export type DailyPlan = { id: string; date: string; items: string; created_at: string }

export function getTodayPlan(db: Database.Database): DailyPlan | undefined {
  const today = new Date().toISOString().slice(0, 10)
  return db.prepare('SELECT * FROM daily_plans WHERE date = ?').get(today) as DailyPlan | undefined
}

export function saveDailyPlan(db: Database.Database, items: string): void {
  const today = new Date().toISOString().slice(0, 10)
  const id = randomUUID()
  db.prepare('INSERT OR REPLACE INTO daily_plans (id, date, items, created_at) VALUES (?, ?, ?, ?)')
    .run(id, today, items, new Date().toISOString())
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) _db = initDb()
  return _db
}

/** For test use only — resets the singleton so tests don't leak to disk */
export function _resetDbSingleton(): void {
  _db = null
}
