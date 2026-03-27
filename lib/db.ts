import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import os from 'os'

export type SessionStatus = 'active' | 'ended'
export type SessionPhase = 'brainstorm' | 'spec' | 'plan' | 'develop' | 'review'

export type Project = {
  id: string
  name: string
  path: string
  ideas_dir: string | null
  specs_dir: string | null
  plans_dir: string | null
  created_at: string
  last_used_at: string | null
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

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) _db = initDb()
  return _db
}

/** For test use only — resets the singleton so tests don't leak to disk */
export function _resetDbSingleton(): void {
  _db = null
}
