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

export type SessionStatus = 'active' | 'ended'
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
}): void {
  db.prepare(`INSERT INTO sessions (id, project_id, label, phase, source_file, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(data.id, data.projectId, data.label, data.phase, data.sourceFile, new Date().toISOString())
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

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) _db = initDb()
  return _db
}

/** For test use only — resets the singleton so tests don't leak to disk */
export function _resetDbSingleton(): void {
  _db = null
}
